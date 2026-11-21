const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const net = require("node:net");

const args = process.argv.slice(2);
const cli = path.join(
  path.dirname(require.resolve("@playwright/test/package.json")),
  "cli.js",
);
const root = path.resolve(__dirname, "..");
const staticExport = args.includes("--static");
const env = {
  ...process.env,
  PLAYWRIGHT_STATIC_EXPORT: String(staticExport),
};
const testArgs = [
  cli,
  "test",
  ...args.filter((argument) => argument !== "--static"),
];

async function availablePort(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}

async function startServer(argv, url, children) {
  const child = spawn(process.execPath, argv, {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let failure;
  let log = "";
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (data) => {
      log = (log + data.toString()).slice(-8000);
    });
  child.once("error", (error) => {
    failure = error;
  });
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (failure) throw failure;
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(
        `Browser test server exited before it was ready.\n${log}`,
      );
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      await response.arrayBuffer();
      if (response.ok) return;
    } catch {
      /* The server is still starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Browser test server did not become ready: ${url}\n${log}`);
}

async function main() {
  if (process.platform !== "win32") {
    const result = spawnSync(process.execPath, testArgs, {
      cwd: root,
      env,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
    return;
  }
  // Playwright's Windows process-tree cleanup uses taskkill, which can hang
  // in restricted environments. Own the two Node servers directly instead.
  await availablePort(3140);
  await availablePort(4140);
  const children = [];
  try {
    await startServer(
      staticExport
        ? [path.join(__dirname, "serve-export.js"), "--port", "3140"]
        : [
            require.resolve("next/dist/bin/next"),
            "start",
            "--hostname",
            "127.0.0.1",
            "--port",
            "3140",
          ],
      "http://127.0.0.1:3140",
      children,
    );
    await startServer(
      ["--import", "tsx", path.join(__dirname, "browser-backend.ts")],
      "http://127.0.0.1:4140/health",
      children,
    );
    process.exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, testArgs, {
        cwd: root,
        env: { ...env, PLAYWRIGHT_MANAGED_SERVERS: "true" },
        stdio: "inherit",
        windowsHide: true,
      });
      children.push(child);
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? 1));
    });
  } finally {
    await Promise.all(
      children.map((child) => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        return new Promise((resolve) => {
          child.once("close", resolve);
          child.kill();
        });
      }),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
