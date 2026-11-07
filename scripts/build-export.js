const { execSync } = require("child_process");

console.log("Building static export for Capacitor Android...");
process.env.STATIC_EXPORT = "true";

try {
  execSync("npx next build", {
    stdio: "inherit",
    env: { ...process.env, STATIC_EXPORT: "true" },
  });
  console.log("Static export build completed successfully into out/");
} catch (error) {
  console.error("Failed to build static export:", error);
  process.exit(1);
}
