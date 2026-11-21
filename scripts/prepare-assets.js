const fs = require("node:fs");
const path = require("node:path");
const { gunzipSync } = require("node:zlib");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");

function copy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

function prepareAssets() {
  const pdfRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
  const ocrRoot = path.dirname(require.resolve("tesseract.js/package.json"));
  const coreRoot = path.dirname(
    require.resolve("tesseract.js-core/package.json"),
  );
  const dataRoot = path.dirname(
    require.resolve("@tesseract.js-data/eng/package.json"),
  );
  copy(
    path.join(pdfRoot, "legacy/build/pdf.worker.min.mjs"),
    path.join(publicDir, "pdf/pdf.worker.min.mjs"),
  );
  for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
    copy(path.join(pdfRoot, directory), path.join(publicDir, "pdf", directory));
  }
  copy(
    path.join(ocrRoot, "dist/worker.min.js"),
    path.join(publicDir, "ocr/worker.min.js"),
  );
  // LSTM-only cores: the worker selects the correct SIMD variant for the CPU.
  for (const variant of ["lstm", "simd-lstm", "relaxedsimd-lstm"]) {
    copy(
      path.join(coreRoot, `tesseract-core-${variant}.wasm.js`),
      path.join(publicDir, "ocr", `tesseract-core-${variant}.wasm.js`),
    );
  }
  // Android's asset packager strips .gz and decompresses these files. Bundle
  // the canonical filename so browsers and native WebViews request the same URL.
  fs.writeFileSync(
    path.join(publicDir, "ocr/eng.traineddata"),
    gunzipSync(
      fs.readFileSync(path.join(dataRoot, "4.0.0_best_int/eng.traineddata.gz")),
    ),
  );
  fs.rmSync(path.join(publicDir, "ocr/eng.traineddata.gz"), { force: true });
  copy(
    path.join(coreRoot, "LICENSE"),
    path.join(publicDir, "ocr/LICENSE-tesseract.txt"),
  );
  console.log(
    "Prepared bundled PDF workers, fonts, and English OCR data for offline use.",
  );
}

if (require.main === module) prepareAssets();
module.exports = { prepareAssets };
