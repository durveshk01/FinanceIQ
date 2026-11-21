const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { unzipSync } = require("fflate");

const root = path.resolve(__dirname, "..");
const args = new Set(process.argv.slice(2));
if (args.has("--help")) {
  console.log(
    "Usage: npm run build:android -- [--debug | --release | --both] [--skip-export]",
  );
  console.log(
    "Builds the offline client, syncs Capacitor, runs Android lint/unit tests, and writes APKs/checksums to dist/android/.",
  );
  process.exit(0);
}
if (
  [...args].some(
    (arg) => !["--debug", "--release", "--both", "--skip-export"].includes(arg),
  )
)
  throw new Error("Unknown Android build option. Use --help.");
const release = args.has("--release") || args.has("--both");
const debug =
  !args.has("--release") || args.has("--both") || args.has("--debug");

function run(command, arguments_, cwd = root) {
  const result = spawnSync(command, arguments_, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Build command failed with exit code ${result.status}: ${path.basename(command)}`,
    );
}

function verifyBundledAssets(apk) {
  const packaged = unzipSync(fs.readFileSync(apk));
  const exportDirectory = path.join(root, "out");
  function verify(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const source = path.join(directory, entry.name);
      if (entry.isDirectory()) verify(source);
      else {
        const relative = path
          .relative(exportDirectory, source)
          .split(path.sep)
          .join("/");
        const asset = packaged[`assets/public/${relative}`];
        if (!asset || !fs.readFileSync(source).equals(Buffer.from(asset)))
          throw new Error(
            `Android packaging omitted or modified ${relative}. Bundle canonical asset filenames instead of .gz aliases.`,
          );
      }
    }
  }
  verify(exportDirectory);
}

try {
  if (!args.has("--skip-export"))
    run(process.execPath, [path.join(__dirname, "build-export.js")]);
  if (!fs.existsSync(path.join(root, "out", "index.html")))
    throw new Error("Missing static export. Run npm run build:export first.");
  const cap = path.join(
    path.dirname(require.resolve("@capacitor/cli/package.json")),
    "bin",
    "capacitor",
  );
  run(process.execPath, [cap, "sync", "android"]);
  const android = path.join(root, "android");
  const tasks = [
    "testDebugUnitTest",
    ...(debug ? ["lintDebug", "assembleDebug"] : []),
    ...(release ? ["lintRelease", "assembleRelease"] : []),
    "--no-daemon",
    "--console=plain",
  ];
  if (process.platform === "win32") {
    run(
      process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", "gradlew.bat", ...tasks],
      android,
    );
  } else {
    run("sh", [path.join(android, "gradlew"), ...tasks], android);
  }
  const output = path.join(root, "dist", "android");
  fs.mkdirSync(output, { recursive: true });
  const files = [];
  for (const mode of [
    ...(debug ? ["debug"] : []),
    ...(release ? ["release"] : []),
  ]) {
    const source = path.join(
      android,
      "app",
      "build",
      "outputs",
      "apk",
      mode,
      `app-${mode}.apk`,
    );
    if (!fs.existsSync(source))
      throw new Error(
        `Missing ${mode} APK. Check release signing configuration.`,
      );
    verifyBundledAssets(source);
    const name = `FinanceIQ-${mode}.apk`;
    const destination = path.join(output, name);
    fs.copyFileSync(source, destination);
    const data = fs.readFileSync(destination);
    const sha256 = crypto.createHash("sha256").update(data).digest("hex");
    fs.writeFileSync(`${destination}.sha256`, `${sha256}  ${name}\n`);
    files.push({ name, size: data.length, sha256 });
  }
  fs.writeFileSync(
    path.join(output, "build-info.json"),
    JSON.stringify(
      {
        version: require("../package.json").version,
        builtAt: new Date().toISOString(),
        files,
      },
      null,
      2,
    ),
  );
  console.log(
    "Android validation and build complete:",
    files.map((file) => `dist/android/${file.name}`).join(", "),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
