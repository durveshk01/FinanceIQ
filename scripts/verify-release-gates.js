const fs = require("node:fs");

try {
  const [mode, file, tag] = process.argv.slice(2);
  const input = fs.readFileSync(file, "utf8");
  if (mode === "certificate") {
    const certificates = [
      ...input.matchAll(
        /^Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]{64})\r?$/gm,
      ),
    ];
    if (
      !/^Verifies\r?$/m.test(input) ||
      !/^Number of signers: 1\r?$/m.test(input) ||
      certificates.length !== 1 ||
      certificates[0][1].toLowerCase() !==
        "52a59142d5ed3d63f2de5631f2d272cf14e6b1faab9a31f07a4a2d40957f90fd"
    )
      throw new Error(
        "Unexpected release certificate identity; publication blocked.",
      );
    console.log("Established release certificate identity verified.");
  } else if (mode === "collision") {
    if (tag !== `v${require("../package.json").version}`)
      throw new Error("Release tag must match the application version.");
    const pages = JSON.parse(input);
    if (
      !Array.isArray(pages) ||
      pages.length === 0 ||
      !pages.every(Array.isArray)
    )
      throw new Error("Invalid release inventory; publication blocked.");
    for (const release of pages.flat()) {
      if (!release || typeof release.tag_name !== "string")
        throw new Error("Invalid release inventory; publication blocked.");
      if (release.tag_name === tag)
        throw new Error(
          "Release already exists; no notes or assets may be replaced.",
        );
    }
    console.log("No existing published or draft release for this tag.");
  } else {
    throw new Error(
      "Usage: verify-release-gates.js certificate|collision <file> [tag]",
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
