const { spawnSync } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");

const KNOWN_PREEXISTING_MIGRATIONS = [
  {
    name: "20261119203000_connected_account_health",
    check: async (prisma) => {
      const rows = await prisma.$queryRaw`
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
      return Boolean(rows[0]?.enum_ready) && Number(rows[0]?.columns_ready) === 3;
    }
  },
  {
    name: "20261122143000_add_oauth_authorization_nonce",
    check: async (prisma) => {
      const rows = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS columns_ready
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'oauth_authorization_codes'
          AND column_name = 'nonce'
          AND data_type = 'text'
      `;
      return Number(rows[0]?.columns_ready) === 1;
    }
  }
];

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
  const migrationsToResolve = [];

  try {
    for (const migration of KNOWN_PREEXISTING_MIGRATIONS) {
      const failed = await prisma.$queryRaw`
        SELECT migration_name
        FROM public."_prisma_migrations"
        WHERE migration_name = ${migration.name}
          AND finished_at IS NULL
          AND rolled_back_at IS NULL
        LIMIT 1
      `;

      if (failed.length === 0) continue;

      const schemaIsComplete = await migration.check(prisma);
      if (!schemaIsComplete) {
        throw new Error(
          `Migration ${migration.name} is marked failed and its expected schema is incomplete. Refusing automatic resolution.`
        );
      }

      migrationsToResolve.push(migration.name);
    }
  } finally {
    await prisma.$disconnect();
  }

  for (const migrationName of migrationsToResolve) {
    console.log(
      `MAX Auth: verified the pre-existing schema for ${migrationName}; resolving it as applied.`
    );
    runPrisma(["migrate", "resolve", "--applied", migrationName]);
  }
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
