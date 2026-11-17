const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { prepareAssets } = require("./prepare-assets");

console.log("Building static export for Capacitor Android...");
const root = path.resolve(__dirname, "..");
const stagingParent = path.join(root, ".capacitor");
fs.mkdirSync(stagingParent, { recursive: true });
const staging = fs.mkdtempSync(path.join(stagingParent, "export-"));

try {
  prepareAssets();
  // POST API routes require a server. Build the offline client in isolation
  // instead of renaming or deleting any of the application's source files.
  for (const filename of [
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "postcss.config.mjs",
    "tsconfig.json",
  ]) {
    fs.copyFileSync(path.join(root, filename), path.join(staging, filename));
  }
  fs.cpSync(path.join(root, "src"), path.join(staging, "src"), {
    recursive: true,
    filter: (source) =>
      source !== path.join(root, "src", "app", "api") &&
      !source.endsWith(".test.ts"),
  });
  fs.cpSync(path.join(root, "public"), path.join(staging, "public"), {
    recursive: true,
  });
  fs.symlinkSync(
    path.join(root, "node_modules"),
    path.join(staging, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  execFileSync(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "build", "--webpack"],
    {
      cwd: staging,
      stdio: "inherit",
      env: {
        ...process.env,
        STATIC_EXPORT: "true",
        NEXT_PUBLIC_STATIC_EXPORT: "true",
      },
    },
  );
  if (!fs.existsSync(path.join(staging, "out", "index.html")))
    throw new Error("Static export did not produce index.html.");
  fs.rmSync(path.join(root, "out"), { recursive: true, force: true });
  fs.cpSync(path.join(staging, "out"), path.join(root, "out"), {
    recursive: true,
  });
  console.log("Static export build completed successfully into out/");
} catch (error) {
  console.error("Failed to build static export:", error);
  process.exitCode = 1;
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
