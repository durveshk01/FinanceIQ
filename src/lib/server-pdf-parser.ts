import path from "node:path";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type { Worker } from "tesseract.js";
import {
  chronologicalTransactions,
  parseGenericBankText,
  parseStructuredTable,
  type ParseResult,
} from "./bank-parsers";
import { pdfTextLayout } from "./pdf-parser";
import { MAX_TRANSACTIONS } from "./upload-validation";

export async function readServerPdfStatement(
  file: File,
  password?: string,
): Promise<ParseResult> {
  // PDF.js needs browser geometry types in serverless Node environments.
  // Loading canvas explicitly also makes Next.js trace its native bindings.
  const canvas = await import("@napi-rs/canvas");
  for (const name of ["DOMMatrix", "ImageData", "Path2D"] as const) {
    if (typeof globalThis[name] === "undefined")
      Object.defineProperty(globalThis, name, {
        value: canvas[name],
        configurable: true,
        writable: true,
      });
  }
  const { PDFParse } = await import("pdf-parse");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const bytes = await file.arrayBuffer();
  const assetDirectory = path.join(process.cwd(), "public", "pdf");
  const loading = pdfjs.getDocument({
    data: new Uint8Array(bytes.slice(0)),
    password,
    isEvalSupported: false,
    maxImageSize: 8_000_000,
    standardFontDataUrl: `${path.join(assetDirectory, "standard_fonts").replace(/\\/g, "/")}/`,
    cMapUrl: `${path.join(assetDirectory, "cmaps").replace(/\\/g, "/")}/`,
    cMapPacked: true,
    wasmUrl: `${path.join(assetDirectory, "wasm").replace(/\\/g, "/")}/`,
  });
  let screenshots: InstanceType<typeof PDFParse> | undefined;
  let worker: Worker | undefined;
  try {
    const document = await loading.promise;
    if (document.numPages > 100)
      throw new Error(
        "Split PDFs longer than 100 pages into smaller statements.",
      );
    const results: ParseResult[] = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const layout = pdfTextLayout(
        content.items.filter((item): item is TextItem => "str" in item),
      );
      let parsed = layout.rows
        ? parseStructuredTable(layout.rows, file.name)
        : parseGenericBankText(layout.text, file.name);
      const summary = parseGenericBankText(layout.text, file.name, false);
      parsed.observedOpeningBalance ??= summary.observedOpeningBalance;
      parsed.observedClosingBalance ??= summary.observedClosingBalance;
      if (!parsed.transactions.length && layout.text.trim().length < 80) {
        screenshots ??= new PDFParse({
          data: new Uint8Array(bytes.slice(0)),
          password,
          isEvalSupported: false,
        });
        if (!worker) {
          const { createWorker } = await import("tesseract.js");
          worker = await createWorker("eng", 1, {
            langPath: path.join(process.cwd(), "public", "ocr"),
            gzip: false,
            cacheMethod: "none",
          });
        }
        const rendered = await screenshots.getScreenshot({
          partial: [number],
          desiredWidth: 1200,
          imageBuffer: true,
          imageDataUrl: false,
        });
        const image = rendered.pages[0]?.data;
        if (image) {
          const recognized = await worker.recognize(
            Buffer.from(image),
            {},
            { blocks: true },
          );
          const words = (recognized.data.blocks ?? []).flatMap((block) =>
            block.paragraphs.flatMap((paragraph) =>
              paragraph.lines.flatMap((line) =>
                line.words.map((word) => ({
                  str: word.text,
                  transform: [1, 0, 0, 1, word.bbox.x0, -line.baseline.y0],
                  width: word.bbox.x1 - word.bbox.x0,
                })),
              ),
            ),
          );
          const ocrLayout = pdfTextLayout(words);
          parsed = ocrLayout.rows
            ? parseStructuredTable(ocrLayout.rows, file.name)
            : parseGenericBankText(recognized.data.text, file.name, false);
          parsed.transactions.forEach((transaction) => {
            transaction.confidence = Math.min(transaction.confidence, 0.7);
          });
        }
      }
      results.push(parsed);
      if (
        results.reduce((sum, result) => sum + result.transactions.length, 0) >
        MAX_TRANSACTIONS
      )
        throw new Error("Import at most 10,000 transactions at a time.");
      page.cleanup();
    }
    const transactions = chronologicalTransactions(
      results.flatMap((result) => result.transactions),
    );
    return {
      transactions,
      duplicateCount: results.reduce(
        (sum, result) => sum + result.duplicateCount,
        0,
      ),
      transferCount: transactions.filter(
        (transaction) => transaction.type === "transfer",
      ).length,
      observedOpeningBalance: results.find(
        (result) => result.observedOpeningBalance !== undefined,
      )?.observedOpeningBalance,
      observedClosingBalance:
        results.findLast(
          (result) =>
            !result.transactions.length &&
            result.observedClosingBalance !== undefined,
        )?.observedClosingBalance ??
        results.find(
          (result) => result.transactions.at(-1) === transactions.at(-1),
        )?.observedClosingBalance,
      formatDetected: "PDF Text / Server OCR",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException")
      throw new Error(
        `${file.name} is password protected. Enter its PDF password and import again.`,
      );
    throw error;
  } finally {
    if (worker) await worker.terminate();
    if (screenshots) await screenshots.destroy();
    await loading.destroy();
  }
}
