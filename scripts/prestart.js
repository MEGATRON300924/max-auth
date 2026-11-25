const { spawnSync } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");

const BLOCKED_MIGRATION = "20261119203000_connected_account_health";

function runPrisma(args) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(command, ["prisma", ...args], {
    env: process.env,
    stdio: "inherit"
  });

  if (result.error) {
    console.error("MAX Auth Prisma command could not be started:", result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status === null ? 1 : result.status);
  }
}

async function recoverKnownPreexistingSchema() {
  const prisma = new PrismaClient();

  try {
    const failed = await prisma.$queryRaw`
      SELECT migration_name
      FROM public."_prisma_migrations"
      WHERE migration_name = ${BLOCKED_MIGRATION}
        AND finished_at IS NULL
        AND rolled_back_at IS NULL
      LIMIT 1
    `;

    if (failed.length === 0) return;

    // This migration failed because its enum and columns already existed.
    // Resolve it as applied only when every expected schema object is present.
    const schema = await prisma.$queryRaw`
      SELECT
        EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_enum e ON e.enumtypid = t.oid
          WHERE t.typname = 'ConnectedAccountStatus'
          GROUP BY t.oid
          HAVING COUNT(*) = 2
             AND BOOL_AND(e.enumlabel IN ('CONNECTED', 'REAUTH_REQUIRED'))
        ) AS enum_ready,
        (
          SELECT COUNT(*)::int
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'connected_accounts'
            AND column_name IN ('status', 'statusReason', 'statusUpdatedAt')
        ) AS columns_ready
    `;

    if (!schema[0]?.enum_ready || Number(schema[0]?.columns_ready) !== 3) {
      throw new Error(
        "The known connected-account migration is marked failed, but its complete schema is not present. Refusing automatic resolution."
      );
    }

    console.log(
      "MAX Auth: verified the complete pre-existing connected-account health schema; resolving its failed migration as applied."
    );
  } finally {
    await prisma.$disconnect();
  }

  runPrisma(["migrate", "resolve", "--applied", BLOCKED_MIGRATION]);
}

async function main() {
  if (process.env.NODE_ENV !== "production") return;

  await recoverKnownPreexistingSchema();
  runPrisma(["migrate", "deploy"]);
}

main().catch((error) => {
  console.error("MAX Auth production migration prestart failed:", error.message);
  process.exit(1);
});
