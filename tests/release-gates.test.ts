import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function gate(mode: string, content: string, tag = "v1.1.0") {
  const root = path.resolve(__dirname, "..", ".capacitor");
  fs.mkdirSync(root, { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, "release-gate-"));
  try {
    const file = path.join(directory, "input.txt");
    fs.writeFileSync(file, content);
    return spawnSync(
      process.execPath,
      [
        path.resolve(__dirname, "../scripts/verify-release-gates.js"),
        mode,
        file,
        tag,
      ],
      { encoding: "utf8" },
    );
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
}

const releaseCertificate =
  "52a59142d5ed3d63f2de5631f2d272cf14e6b1faab9a31f07a4a2d40957f90fd";
function signature(certificate: string) {
  return `Verifies\nNumber of signers: 1\nSigner #1 certificate SHA-256 digest: ${certificate}\n`;
}

test("release certificate gate accepts the established single signer", () => {
  const result = gate("certificate", signature(releaseCertificate));
  assert.equal(result.status, 0, result.stderr);
});
test("release certificate gate rejects a valid debug-signed identity", () => {
  const result = gate(
    "certificate",
    signature(
      "a29ecb9995c3272a93e42dbb47e5a09a0d242bd377c66dac1fbd8e262bc1654a",
    ),
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /certificate identity/);
});
test("release certificate gate rejects missing or additional signers", () => {
  for (const content of [
    "Verifies\n",
    `${signature(releaseCertificate)}Signer #2 certificate SHA-256 digest: ${releaseCertificate}\n`,
    signature(releaseCertificate).replace("signers: 1", "signers: 2"),
  ]) {
    const result = gate("certificate", content);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /certificate identity/);
  }
});
test("release collision gate allows a new tag across valid pages", () => {
  const result = gate(
    "collision",
    JSON.stringify([[{ tag_name: "v1.0.0" }], []]),
  );
  assert.equal(result.status, 0, result.stderr);
});
test("release collision gate rejects published and draft collisions on later pages", () => {
  for (const draft of [false, true]) {
    const result = gate(
      "collision",
      JSON.stringify([
        [{ tag_name: "v1.0.0" }],
        [{ tag_name: "v1.1.0", draft }],
      ]),
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /already exists/);
  }
});
test("release collision gate fails closed on malformed API results", () => {
  for (const content of [
    "",
    "{}",
    '[{"message":"Bad credentials"}]',
    "[[{}]]",
  ]) {
    const result = gate("collision", content);
    assert.equal(result.status, 1);
  }
});
