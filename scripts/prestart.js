const { spawnSync } = require("node:child_process");

if (process.env.NODE_ENV !== "production") {
  process.exit(0);
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["prisma", "migrate", "deploy"], {
  env: process.env,
  stdio: "inherit"
});

if (result.error) {
  console.error("MAX Auth database migrations could not be started:", result.error.message);
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
