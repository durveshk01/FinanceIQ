const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { nodeFileTrace } = require("next/dist/compiled/@vercel/nft");

async function main() {
  const root = path.resolve(__dirname, "..");
  const manifest = path.join(
    root,
    ".next/server/app/api/analyze/route.js.nft.json",
  );
  const { files } = JSON.parse(await fs.readFile(manifest, "utf8"));
  const packaged = new Set(
    files.map((file) => path.resolve(path.dirname(manifest), file)),
  );
  // These workers load outside the API's import graph. Trace their real
  // dependencies independently, then verify the deployable artifact has them.
  const workers = [
    "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    "node_modules/tesseract.js/src/worker-script/node/index.js",
  ];
  const { fileList } = await nodeFileTrace(workers, { base: root });
  const required = [...fileList];
  const core = "node_modules/tesseract.js-core";
  // Emscripten reads these binaries by filename instead of importing them.
  for (const file of await fs.readdir(path.join(root, core)))
    if (file.endsWith(".wasm")) required.push(path.join(core, file));
  required.push("public/ocr/eng.traineddata");
  const missing = required.filter(
    (file) => !packaged.has(path.resolve(root, file)),
  );
  assert.deepEqual(missing, [], "Serverless PDF/OCR dependencies are missing");
  console.log("Serverless PDF/OCR dependency packaging verified.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
