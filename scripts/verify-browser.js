const path = require("node:path");
const { spawnSync } = require("node:child_process");

const args = process.argv.slice(2);
const cli = path.join(
  path.dirname(require.resolve("@playwright/test/package.json")),
  "cli.js",
);
const result = spawnSync(
  process.execPath,
  [cli, "test", ...args.filter((argument) => argument !== "--static")],
  {
    stdio: "inherit",
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      ...(args.includes("--static")
        ? { PLAYWRIGHT_STATIC_EXPORT: "true" }
        : {}),
    },
  },
);
if (result.error) console.error(result.error);
process.exitCode = result.status ?? 1;
