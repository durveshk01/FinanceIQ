import type { Transaction } from "./schemas";
import {
  categorizeTransaction,
  cleanDescription,
  isTransferTransaction,
} from "./categorizer";
import { roundMoney } from "./money";

export type RawParsedRow = {
  date: string;
  description: string;
  debit: number;
  credit: number;
  amount: number;
  reference?: string;
  runningBalance?: number;
};

export type ParseResult = {
  transactions: Transaction[];
  openingBalance?: number;
  closingBalance?: number;
  observedOpeningBalance?: number;
  observedClosingBalance?: number;
  duplicateCount: number;
  transferCount: number;
  formatDetected: string;
};

export function parseOptionalMonetaryValue(value: unknown): number | undefined {
  if (typeof value === "number")
    return Number.isFinite(value) ? roundMoney(value) : undefined;
  if (value == null) return undefined;
  const original = String(value).trim();
  if (!original || /^(?:-|nil|n\/a)$/i.test(original)) return undefined;
  const negative =
    /^\(.*\)$/.test(original) || /(?:dr|debit)\s*$/i.test(original);
  let text = original
    .replace(/(?:dr|cr|debit|credit)\s*$/i, "")
    .replace(/\b(?:INR|USD|EUR|GBP|RS\.?|AUD|CAD)\b/gi, "")
    .replace(/[₹$€£()\s]/g, "");
  // Accept decimal-comma statements as well as Indian/US digit grouping.
  if (
    text.includes(",") &&
    text.includes(".") &&
    text.lastIndexOf(",") > text.lastIndexOf(".")
  ) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d+,\d{1,2}$/.test(text)) {
    text = text.replace(",", ".");
  } else {
    text = text.replace(/,/g, "");
  }
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) return undefined;
  const amount = Number(text);
  return Number.isFinite(amount)
    ? roundMoney(negative ? -Math.abs(amount) : amount)
    : undefined;
}

export function parseMonetaryValue(value: unknown): number {
  return parseOptionalMonetaryValue(value) ?? 0;
}

/** Reverse descending statement rows before a stable date sort. For a single
 * date, use observed balance continuity rather than arbitrarily reordering. */
export function chronologicalTransactions(
  transactions: Transaction[],
): Transaction[] {
  let ordered = [...transactions];
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (first && last && first.date > last.date) ordered.reverse();
  ordered.sort((a, b) => a.date.localeCompare(b.date));
  if (
    first &&
    last &&
    first.date === last.date &&
    ordered.every((t) => t.date === first.date)
  ) {
    const score = (rows: Transaction[]) =>
      rows.reduce((sum, row, index) => {
        const previous = rows[index - 1];
        return (
          sum +
          (previous?.runningBalance !== undefined &&
          row.runningBalance !== undefined &&
          Math.abs(
            roundMoney(previous.runningBalance + row.amount) -
              row.runningBalance,
          ) <= 0.01
            ? 1
            : 0)
        );
      }, 0);
    const reversed = [...ordered].reverse();
    if (score(reversed) > score(ordered)) ordered = reversed;
  }
  return ordered;
}

type DateOrder = "DMY" | "MDY";
const months = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

function validDate(year: number, month: number, day: number): string {
  if (
    year < 1900 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  )
    return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : "";
}

export function normalizeDateString(
  raw: string,
  order: DateOrder = "DMY",
): string {
  const text = raw.trim();
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[T\s])/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const named = text.match(/^(\d{1,2})[-/\s]([A-Za-z]{3})[-/\s](\d{2}|\d{4})$/);
  const usNamed = text.match(/^([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (named || usNamed) {
    const match = named ?? usNamed!;
    const month =
      months.indexOf((named ? match[2] : match[1]).toLowerCase()) + 1;
    const day = Number(named ? match[1] : match[2]);
    let year = Number(match[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return validDate(year, month, day);
  }
  const numeric = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (numeric) {
    let year = Number(numeric[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const useUS = order === "MDY" || (second > 12 && first <= 12);
    return validDate(year, useUS ? first : second, useUS ? second : first);
  }
  // Excel serial dates use the 1899-12-30 epoch (including its leap-year quirk).
  if (/^\d{5}(?:\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial >= 1 && serial <= 100000)
      return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000)
        .toISOString()
        .slice(0, 10);
  }
  return "";
}

function delimiterCounts(line: string): Record<string, number> {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0, "|": 0 };
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (quoted && line[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted && line[i] in counts) counts[line[i]]++;
  }
  return counts;
}

/** RFC-style CSV parsing, including quoted newlines and a statement preamble. */
export function parseCsvRows(csvText: string): string[][] {
  let text = csvText.replace(/^\uFEFF/, "");
  const separator = text.match(/^sep=(.)\r?\n/i);
  if (separator) text = text.slice(separator[0].length);
  const candidates = text
    .split(/\r?\n/)
    .slice(0, 25)
    .filter((line) => line.trim());
  const header = candidates.find(
    (line) =>
      /date|txn dt/i.test(line) &&
      /amount|debit|credit|withdrawal|money out|paid out/i.test(line),
  );
  const counts = delimiterCounts(
    header ??
      candidates.reduce(
        (best, line) =>
          Math.max(...Object.values(delimiterCounts(line))) >
          Math.max(...Object.values(delimiterCounts(best)))
            ? line
            : best,
        "",
      ),
  );
  const delimiter =
    separator?.[1] ?? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const finishRow = () => {
    row.push(cell.trim());
    if (row.some((value) => value.length)) rows.push(row);
    row = [];
    cell = "";
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      finishRow();
    } else cell += char;
  }
  if (quoted) throw new Error("The CSV contains an unterminated quoted cell.");
  if (cell.length || row.length) finishRow();
  return rows;
}

export function detectColumnIndices(headers: string[]) {
  const columns = {
    dateIdx: -1,
    descIdx: -1,
    debitIdx: -1,
    creditIdx: -1,
    amountIdx: -1,
    balanceIdx: -1,
    refIdx: -1,
    typeIdx: -1,
    categoryIdx: -1,
    excludedIdx: -1,
  };
  headers.forEach((header, i) => {
    const col = header
      .toLowerCase()
      .replace(/[_.]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // "Debit balance" is a balance, and "Debit/Credit" is a direction flag.
    if (/balance|closing bal|^bal$/.test(col) && columns.balanceIdx < 0)
      columns.balanceIdx = i;
    else if (
      /^(?:type|txn type|transaction type|dr\s*\/\s*cr|debit\s*\/\s*credit)$/.test(
        col,
      )
    )
      columns.typeIdx = i;
    else if (/date|^(?:dt|value dt|txn dt)$/.test(col) && columns.dateIdx < 0)
      columns.dateIdx = i;
    else if (
      /description|narration|particulars|remarks|details/.test(col) &&
      (columns.descIdx < 0 || /^merchant$/i.test(headers[columns.descIdx]))
    )
      columns.descIdx = i;
    else if (col === "merchant" && columns.descIdx < 0) columns.descIdx = i;
    else if (
      /withdrawal|debit|^dr(?: amount)?$|money out|paid out/.test(col) &&
      columns.debitIdx < 0
    )
      columns.debitIdx = i;
    else if (
      /deposit|credit|^cr(?: amount)?$|money in|paid in/.test(col) &&
      columns.creditIdx < 0
    )
      columns.creditIdx = i;
    else if (/^(?:amount|txn amount|transaction amount|net amount)$/.test(col))
      columns.amountIdx = i;
    else if (/ref|chq|cheque|utr/.test(col) && columns.refIdx < 0)
      columns.refIdx = i;
    else if (col === "category") columns.categoryIdx = i;
    else if (/^(?:excluded|is excluded)$/.test(col)) columns.excludedIdx = i;
  });
  return columns;
}

function isTableHeader(row: string[]): boolean {
  const c = detectColumnIndices(row);
  return (
    c.dateIdx >= 0 &&
    c.descIdx >= 0 &&
    (c.amountIdx >= 0 || c.debitIdx >= 0 || c.creditIdx >= 0)
  );
}

export function transactionFingerprint(transaction: Transaction): string {
  if (transaction.reference.trim())
    return [
      transaction.date,
      Math.round(transaction.amount * 100),
      transaction.reference.trim().toLowerCase(),
    ].join("|");
  return [
    transaction.date,
    Math.round(transaction.amount * 100),
    transaction.description.toLowerCase().replace(/\s+/g, " "),
    transaction.reference,
    transaction.runningBalance ?? "",
  ].join("|");
}

function makeTransaction(
  row: RawParsedRow,
  filename: string,
  category?: string,
  excluded = false,
): Transaction {
  const info = categorizeTransaction(row.description, row.amount);
  const transfer =
    isTransferTransaction(row.description, category) || info.isTransfer;
  return {
    id: `txn_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`,
    date: row.date,
    description: cleanDescription(row.description),
    merchant: info.merchant,
    debit: row.debit,
    credit: row.credit,
    amount: row.amount,
    type: transfer ? "transfer" : row.amount > 0 ? "income" : "expense",
    category: category || info.category,
    subcategory: info.subcategory,
    paymentMethod: /upi/i.test(row.description)
      ? "UPI"
      : /pos|card/i.test(row.description)
        ? "Debit Card"
        : "Bank Transfer",
    account: "Primary Account",
    reference: row.reference ?? "",
    runningBalance: row.runningBalance,
    importSource: filename,
    confidence: info.confidence,
    isReviewed: Boolean(category),
    isExcluded: excluded,
    notes: "",
  };
}

const summaryDescription =
  /^(?:opening balance|closing balance|brought forward|carried forward|grand total|total(?:s)?(?:\s+(?:debits?|credits?|withdrawals?|deposits?|amount))?)\s*[:.-]?$/i;

export function parseStructuredTable(
  rows: string[][],
  filename = "statement.csv",
): ParseResult {
  const headerIndex = rows.slice(0, 25).findIndex(isTableHeader);
  if (headerIndex < 0)
    return parseGenericBankText(
      rows.map((r) => r.join(" ")).join("\n"),
      filename,
      false,
    );
  const c = detectColumnIndices(rows[headerIndex]);
  let order: DateOrder = /chase|bank.of.america|\bboa\b/i.test(filename)
    ? "MDY"
    : "DMY";
  for (const row of rows.slice(headerIndex + 1)) {
    const match = row[c.dateIdx]?.match(/^(\d{1,2})[/-](\d{1,2})[/-]\d{2,4}$/);
    if (match && Number(match[1]) > 12) {
      order = "DMY";
      break;
    }
    if (match && Number(match[2]) > 12) {
      order = "MDY";
      break;
    }
  }
  const transactions: Transaction[] = [];
  const seenReferences = new Set<string>();
  let duplicateCount = 0;
  let opening: number | undefined;
  let closing: number | undefined;
  for (const row of rows.slice(headerIndex + 1)) {
    if (isTableHeader(row)) continue;
    const description = row[c.descIdx]?.trim() ?? "";
    const balanceCell =
      c.balanceIdx >= 0 ? row[c.balanceIdx]?.trim() : undefined;
    const balance = parseOptionalMonetaryValue(balanceCell);
    if (
      /^opening balance\s*[:.-]?$/i.test(description) &&
      balance !== undefined
    )
      opening = balance;
    if (
      /^closing balance\s*[:.-]?$/i.test(description) &&
      balance !== undefined
    )
      closing = balance;
    const date = normalizeDateString(row[c.dateIdx] ?? "", order);
    if (!date || !description || summaryDescription.test(description)) continue;
    let debit = 0;
    let credit = 0;
    let amount = 0;
    if (c.debitIdx >= 0 || c.creditIdx >= 0) {
      debit = Math.abs(parseMonetaryValue(row[c.debitIdx]));
      credit = Math.abs(parseMonetaryValue(row[c.creditIdx]));
      amount = roundMoney(credit - debit);
    } else {
      amount = parseMonetaryValue(row[c.amountIdx]);
      const direction = row[c.typeIdx]?.trim() ?? "";
      if (/^(?:dr\.?|d|debit|expense|withdrawal|payment)$/i.test(direction))
        amount = -Math.abs(amount);
      if (/^(?:cr\.?|c|credit|income|deposit)$/i.test(direction))
        amount = Math.abs(amount);
      debit = amount < 0 ? -amount : 0;
      credit = amount > 0 ? amount : 0;
    }
    if (!amount) continue;
    const category = c.categoryIdx >= 0 ? row[c.categoryIdx] : undefined;
    const reference = c.refIdx >= 0 ? (row[c.refIdx] ?? "") : "";
    const transaction = makeTransaction(
      {
        date,
        description,
        debit,
        credit,
        amount,
        reference,
        runningBalance: balance,
      },
      filename,
      category,
      /^(?:true|1|yes)$/i.test(row[c.excludedIdx] ?? ""),
    );
    // Equal cash purchases on the same day are legitimate. Only collapse a
    // repeated bank reference inside one statement; cross-file dedupe is separate.
    const referenceKey = `${date}|${amount}|${reference}`;
    if (reference && seenReferences.has(referenceKey)) {
      duplicateCount++;
      continue;
    }
    if (reference) seenReferences.add(referenceKey);
    transactions.push(transaction);
  }
  transactions.splice(
    0,
    transactions.length,
    ...chronologicalTransactions(transactions),
  );
  return {
    transactions,
    observedOpeningBalance: opening,
    observedClosingBalance:
      closing ??
      transactions.findLast((t) => t.runningBalance !== undefined)
        ?.runningBalance,
    duplicateCount,
    transferCount: transactions.filter((t) => t.type === "transfer").length,
    formatDetected: "Structured Statement (Table Profile)",
  };
}

const datePattern =
  /\b(?:\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}[-/\s][A-Za-z]{3}[-/\s]\d{2,4})\b/g;
const moneyPattern =
  /(?<![\w/])(?:[₹$€£]\s*)?[+-]?\(?\d[\d,]*(?:\.\d{1,2})?\)?(?:\s*(?:CR|DR)\b)?(?![\w/.-])/gi;

export function parseGenericBankText(
  text: string,
  filename = "statement.txt",
  inferTable = true,
): ParseResult {
  if (inferTable && /[,;\t|]/.test(text)) {
    const rows = parseCsvRows(text);
    if (rows.slice(0, 25).some(isTableHeader))
      return parseStructuredTable(rows, filename);
  }
  const transactions: Transaction[] = [];
  const seenReferences = new Set<string>();
  let duplicateCount = 0;
  let opening: number | undefined;
  let closing: number | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const summary = line.match(/^(opening|closing) balance\s*[:\s]+(.+)$/i);
    if (summary) {
      if (summary[1].toLowerCase() === "opening")
        opening = parseOptionalMonetaryValue(summary[2]);
      else closing = parseOptionalMonetaryValue(summary[2]);
      continue;
    }
    const dates = [...line.matchAll(datePattern)];
    if (!dates.length) continue;
    const date = normalizeDateString(dates[0][0]);
    if (!date) continue;
    let rest = line.replace(datePattern, " ").trim();
    const referenceMatch = rest.match(
      /\b(?:ref(?:erence)?|utr|chq)\s*[:#/-]?\s*([A-Za-z0-9-]{3,})/i,
    );
    const reference = referenceMatch?.[1] ?? "";
    if (referenceMatch) rest = rest.replace(referenceMatch[0], " ");
    const matches = [...rest.matchAll(moneyPattern)];
    if (!matches.length) continue;
    const explicit = rest.match(
      /\b(?:credit|cr|debit|dr|withdrawal|deposit|amount)\s+(?:INR\s*)?([₹$€£]?\s*[+-]?\d[\d,]*(?:\.\d{1,2})?)/i,
    );
    let amountMatch = matches[matches.length - 1];
    let runningBalance: number | undefined;
    if (explicit) {
      amountMatch =
        matches.find(
          (m) =>
            m.index! >= explicit.index! && m[0].trim() === explicit[1].trim(),
        ) ?? amountMatch;
      const last = matches[matches.length - 1];
      if (last.index! > amountMatch.index!)
        runningBalance = parseMonetaryValue(last[0]);
    } else if (matches.length >= 2) {
      // Text statements generally end in amount, balance. Ignore a standalone
      // numeric reference when there is only one decimal/currency amount.
      const monetary = matches.filter((m) =>
        /[.,₹$€£]|[+-]|\b(?:CR|DR)\b/i.test(m[0]),
      );
      if (monetary.length === 1 && matches.length === 2)
        amountMatch = monetary[0];
      else {
        amountMatch = matches[matches.length - 2];
        runningBalance = parseMonetaryValue(matches[matches.length - 1][0]);
        if (parseMonetaryValue(amountMatch[0]) === 0 && matches.length >= 3)
          amountMatch = matches[matches.length - 3];
      }
    }
    const rawAmount = parseMonetaryValue(amountMatch[0]);
    if (!rawAmount) continue;
    const directionText = rest.slice(
      0,
      amountMatch.index! + amountMatch[0].length,
    );
    const isCredit =
      /\b(?:credit|cr|deposit|salary|payroll|refund|interest)\b/i.test(
        directionText,
      ) || /^\+/.test(amountMatch[0]);
    const isDebit =
      /\b(?:debit|dr|withdrawal|paid|spent|purchase)\b/i.test(directionText) ||
      rawAmount < 0;
    const amount =
      isCredit && !isDebit ? Math.abs(rawAmount) : -Math.abs(rawAmount);
    const description = cleanDescription(
      rest
        .slice(0, amountMatch.index)
        .replace(/\b(?:amount|balance)\s*[:.-]?\s*$/i, ""),
    );
    if (!description || summaryDescription.test(description)) continue;
    const transaction = makeTransaction(
      {
        date,
        description,
        debit: amount < 0 ? -amount : 0,
        credit: amount > 0 ? amount : 0,
        amount,
        reference,
        runningBalance,
      },
      filename,
    );
    const key = `${date}|${amount}|${reference}`;
    if (reference && seenReferences.has(key)) {
      duplicateCount++;
      continue;
    }
    if (reference) seenReferences.add(key);
    transactions.push(transaction);
  }
  transactions.splice(
    0,
    transactions.length,
    ...chronologicalTransactions(transactions),
  );
  return {
    transactions,
    observedOpeningBalance: opening,
    observedClosingBalance:
      closing ??
      transactions.findLast((t) => t.runningBalance !== undefined)
        ?.runningBalance,
    duplicateCount,
    transferCount: transactions.filter((t) => t.type === "transfer").length,
    formatDetected: "Text Statement (Date / Amount / Balance)",
  };
}
