import {
  chronologicalTransactions,
  detectColumnIndices,
  parseGenericBankText,
  parseStructuredTable,
  type ParseResult,
} from "./bank-parsers";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type { Worker } from "tesseract.js";
import { MAX_TRANSACTIONS } from "./upload-validation";

type PdfTextItem = Pick<TextItem, "str" | "transform" | "width">;

/** Recover table geometry, including empty debit/credit cells. */
export function pdfTextLayout(items: PdfTextItem[]): {
  text: string;
  rows?: string[][];
} {
  const lines: { y: number; items: PdfTextItem[] }[] = [];
  for (const item of [...items].sort(
    (a, b) =>
      b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4],
  )) {
    if (!item.str.trim()) continue;
    let line = lines.find(
      (candidate) => Math.abs(candidate.y - item.transform[5]) < 3,
    );
    if (!line) {
      line = { y: item.transform[5], items: [] };
      lines.push(line);
    }
    line.items.push(item);
  }
  const chunks = lines.map((line) => {
    const values: { text: string; x: number; end: number }[] = [];
    for (const item of line.items.sort(
      (a, b) => a.transform[4] - b.transform[4],
    )) {
      const last = values[values.length - 1];
      const x = item.transform[4];
      if (last && x - last.end < 12) {
        last.text += ` ${item.str}`;
        last.end = Math.max(last.end, x + item.width);
      } else values.push({ text: item.str, x, end: x + item.width });
    }
    return values;
  });
  const text = chunks
    .map((line) => line.map((chunk) => chunk.text).join("\t"))
    .join("\n");
  const headerIndex = chunks.findIndex((line) => {
    const c = detectColumnIndices(line.map((chunk) => chunk.text));
    return (
      c.dateIdx >= 0 &&
      c.descIdx >= 0 &&
      (c.amountIdx >= 0 || c.debitIdx >= 0 || c.creditIdx >= 0)
    );
  });
  if (headerIndex < 0) return { text };
  const header = chunks[headerIndex];
  const centers = header.map((chunk) => (chunk.x + chunk.end) / 2);
  const boundaries = centers
    .slice(1)
    .map((center, i) => (centers[i] + center) / 2);
  const rows = [header.map((chunk) => chunk.text)];
  for (const line of chunks.slice(headerIndex + 1)) {
    const row = Array<string>(header.length).fill("");
    for (const chunk of line) {
      let column = boundaries.findIndex((boundary) => chunk.x < boundary);
      if (column < 0) column = header.length - 1;
      row[column] = `${row[column]} ${chunk.text}`.trim();
    }
    rows.push(row);
  }
  return { text, rows };
}

export async function readPdfStatement(
  file: File,
  password?: string,
  onStep?: (step: string) => void,
): Promise<ParseResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const base = new URL("/pdf/", window.location.href).href;
  pdfjs.GlobalWorkerOptions.workerSrc = `${base}pdf.worker.min.mjs`;
  const loading = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    password,
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
    wasmUrl: `${base}wasm/`,
    isEvalSupported: false,
    maxImageSize: 8_000_000,
  });
  let worker: Worker | undefined;
  try {
    const document = await loading.promise;
    if (document.numPages > 100)
      throw new Error(
        "Split PDFs longer than 100 pages into smaller statements.",
      );
    const results: ParseResult[] = [];
    for (let number = 1; number <= document.numPages; number++) {
      onStep?.(`Reading ${file.name}, page ${number}/${document.numPages}...`);
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
        const { createWorker } = await import("tesseract.js");
        onStep?.(
          `Recognizing ${file.name}, page ${number}/${document.numPages} on device...`,
        );
        if (!worker) {
          worker = await createWorker("eng", 1, {
            workerPath: new URL("/ocr/worker.min.js", window.location.href)
              .href,
            corePath: new URL("/ocr/", window.location.href).href,
            langPath: new URL("/ocr/", window.location.href).href,
            gzip: false,
            workerBlobURL: false,
            cacheMethod: "none",
          });
        }
        const original = page.getViewport({ scale: 1 });
        const scale = Math.min(
          2,
          Math.sqrt(2_000_000 / (original.width * original.height)),
        );
        const viewport = page.getViewport({ scale });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d");
        if (!context)
          throw new Error(
            "The device could not allocate a PDF drawing surface.",
          );
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const recognized = await worker.recognize(canvas, {}, { blocks: true });
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
        canvas.width = 0;
        canvas.height = 0;
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
      transferCount: transactions.filter((t) => t.type === "transfer").length,
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
      formatDetected: "PDF Text / On-device OCR",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException")
      throw new Error(
        `${file.name} is password protected. Enter its PDF password and import again.`,
      );
    throw error;
  } finally {
    if (worker) await worker.terminate();
    await loading.destroy();
  }
}
