import { type Transaction } from "./schemas";
import { categorizeTransaction, isTransferTransaction } from "./categorizer";

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

export function parseMonetaryValue(val: unknown): number {
  if (typeof val === "number") return isFinite(val) ? val : 0;
  if (!val) return 0;
  let str = String(val).trim();
  if (str === "" || str === "-" || str.toLowerCase() === "nil") return 0;

  const isDr = /\b(dr|debit)\b/i.test(str);
  const isCr = /\b(cr|credit)\b/i.test(str);
  const isParenNegative = /^\(.*\)$/.test(str);

  // Remove currency signs, letters, commas, and parentheses
  str = str.replace(/[₹$€£,()\s]/g, "").replace(/\b(dr|cr|debit|credit)\b/gi, "");

  const num = parseFloat(str);
  if (isNaN(num)) return 0;

  if (isParenNegative || isDr) return -Math.abs(num);
  if (isCr) return Math.abs(num);
  return num;
}

export function normalizeDateString(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return new Date().toISOString().slice(0, 10);

  // Check ISO format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }

  // Handle DD-MMM-YYYY or DD/MMM/YYYY e.g., 05-May-2026 or 05-MAY-26
  const monthMap: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const namedMatch = trimmed.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{2,4})/);
  if (namedMatch) {
    const day = namedMatch[1].padStart(2, "0");
    const month = monthMap[namedMatch[2].toLowerCase()] || "01";
    let year = namedMatch[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  // Handle DD/MM/YYYY or MM/DD/YYYY or DD-MM-YYYY
  const parts = trimmed.split(/[/.-]/).map(p => p.trim());
  if (parts.length >= 3) {
    const [p1, p2, p3] = parts;
    if (p1.length === 4) {
      // YYYY/MM/DD
      return `${p1}-${p2.padStart(2, "0")}-${p3.padStart(2, "0")}`;
    }
    let year = p3;
    if (year.length === 2) year = `20${year}`;

    // Common standard for bank statements: DD/MM/YYYY
    const day = p1.padStart(2, "0");
    const month = p2.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return new Date().toISOString().slice(0, 10);
}

export function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  const lines = csvText.split(/\r?\n/);
  
  // Detect delimiter: comma, semicolon, tab, pipe
  const firstLine = lines.find(l => l.trim().length > 0) || "";
  let delimiter = ",";
  const counts = {
    ",": (firstLine.match(/,/g) || []).length,
    ";": (firstLine.match(/;/g) || []).length,
    "\t": (firstLine.match(/\t/g) || []).length,
    "|": (firstLine.match(/\|/g) || []).length,
  };
  const max = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (max && max[1] > 0) delimiter = max[0];

  for (const line of lines) {
    if (!line.trim()) continue;
    
    // Parse quotes-aware CSV row
    const row: string[] = [];
    let insideQuotes = false;
    let currentCell = "";
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          currentCell += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === delimiter && !insideQuotes) {
        row.push(currentCell.trim());
        currentCell = "";
      } else {
        currentCell += char;
      }
    }
    row.push(currentCell.trim());
    if (row.some(c => c.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

export function detectColumnIndices(headers: string[]) {
  const hLower = headers.map(h => h.toLowerCase().trim());
  let dateIdx = -1;
  let descIdx = -1;
  let debitIdx = -1;
  let creditIdx = -1;
  let amountIdx = -1;
  let balanceIdx = -1;
  let refIdx = -1;
  let typeIdx = -1;

  for (let i = 0; i < hLower.length; i++) {
    const col = hLower[i];
    if (dateIdx === -1 && (col.includes("date") || col === "dt" || col === "value dt" || col === "txn date")) {
      dateIdx = i;
    } else if (descIdx === -1 && (col.includes("description") || col.includes("narration") || col.includes("particulars") || col.includes("remarks") || col.includes("details") || col === "merchant")) {
      descIdx = i;
    } else if (debitIdx === -1 && (col.includes("withdrawal") || col.includes("debit") || col === "dr" || col === "dr amount")) {
      debitIdx = i;
    } else if (creditIdx === -1 && (col.includes("deposit") || col.includes("credit") || col === "cr" || col === "cr amount")) {
      creditIdx = i;
    } else if (amountIdx === -1 && (col === "amount" || col.includes("txn amount") || col === "net amount")) {
      amountIdx = i;
    } else if (balanceIdx === -1 && (col.includes("balance") || col === "closing bal" || col === "bal")) {
      balanceIdx = i;
    } else if (refIdx === -1 && (col.includes("ref") || col.includes("chq") || col.includes("cheque") || col.includes("reference") || col.includes("utr"))) {
      refIdx = i;
    } else if (typeIdx === -1 && (col === "type" || col === "txn type" || col === "dr/cr")) {
      typeIdx = i;
    }
  }

  return { dateIdx, descIdx, debitIdx, creditIdx, amountIdx, balanceIdx, refIdx, typeIdx };
}

export function parseStructuredTable(rows: string[][], filename = "statement.csv"): ParseResult {
  if (rows.length === 0) {
    return { transactions: [], duplicateCount: 0, transferCount: 0, formatDetected: "Empty" };
  }

  // Find header row (usually contains "date", "description" or "narration", etc.)
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const rowStr = rows[i].join(" ").toLowerCase();
    if (rowStr.includes("date") && (rowStr.includes("amount") || rowStr.includes("debit") || rowStr.includes("withdrawal") || rowStr.includes("narration") || rowStr.includes("description") || rowStr.includes("particulars"))) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    // Fallback: treat as raw text rows
    return parseGenericBankText(rows.map(r => r.join(" ")).join("\n"), filename);
  }

  const headers = rows[headerRowIndex];
  const { dateIdx, descIdx, debitIdx, creditIdx, amountIdx, balanceIdx, refIdx, typeIdx } = detectColumnIndices(headers);

  const transactions: Transaction[] = [];
  const seenHashes = new Set<string>();
  let duplicateCount = 0;
  let transferCount = 0;
  let observedOpening: number | undefined;
  let observedClosing: number | undefined;

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= Math.max(dateIdx, descIdx)) continue;

    const rawDate = dateIdx >= 0 ? row[dateIdx] : "";
    const rawDesc = descIdx >= 0 ? row[descIdx] : "";
    if (!rawDate || !rawDesc) continue;

    // Verify it has date-like characteristics
    if (!/\d/.test(rawDate)) continue;

    const date = normalizeDateString(rawDate);
    const reference = refIdx >= 0 ? row[refIdx] : "";
    const runningBal = balanceIdx >= 0 ? parseMonetaryValue(row[balanceIdx]) : undefined;

    if (runningBal !== undefined) {
      if (observedOpening === undefined) observedOpening = runningBal;
      observedClosing = runningBal;
    }

    let debit = 0;
    let credit = 0;
    let netAmount = 0;

    if (debitIdx >= 0 || creditIdx >= 0) {
      const rawDebit = debitIdx >= 0 ? parseMonetaryValue(row[debitIdx]) : 0;
      const rawCredit = creditIdx >= 0 ? parseMonetaryValue(row[creditIdx]) : 0;
      debit = Math.abs(rawDebit);
      credit = Math.abs(rawCredit);
      netAmount = credit > 0 ? credit : -debit;
    } else if (amountIdx >= 0) {
      const parsedAmt = parseMonetaryValue(row[amountIdx]);
      if (typeIdx >= 0) {
        const typeStr = (row[typeIdx] || "").toLowerCase();
        if (typeStr.includes("dr") || typeStr.includes("debit")) {
          debit = Math.abs(parsedAmt);
          netAmount = -debit;
        } else {
          credit = Math.abs(parsedAmt);
          netAmount = credit;
        }
      } else {
        if (parsedAmt < 0) {
          debit = Math.abs(parsedAmt);
          netAmount = parsedAmt;
        } else {
          credit = parsedAmt;
          netAmount = parsedAmt;
        }
      }
    }

    // Skip zero amount or summary rows
    if (debit === 0 && credit === 0 && netAmount === 0) continue;
    if (/total|closing balance|opening balance|brought forward|carried forward/i.test(rawDesc)) continue;

    // Check duplicate hash
    const txnHash = `${date}|${netAmount}|${rawDesc.slice(0, 30).toLowerCase()}|${reference}`;
    if (seenHashes.has(txnHash)) {
      duplicateCount++;
      continue;
    }
    seenHashes.add(txnHash);

    const isTransfer = isTransferTransaction(rawDesc);
    if (isTransfer) transferCount++;

    const catInfo = categorizeTransaction(rawDesc, netAmount);

    transactions.push({
      id: `txn_${i}_${Date.now().toString(36)}_${Math.abs(netAmount)}`,
      date,
      description: rawDesc,
      merchant: catInfo.merchant,
      debit,
      credit,
      amount: netAmount,
      type: isTransfer ? "transfer" : netAmount >= 0 ? "income" : "expense",
      category: catInfo.category,
      subcategory: catInfo.subcategory,
      paymentMethod: /upi/i.test(rawDesc) ? "UPI" : /pos|card/i.test(rawDesc) ? "Debit Card" : /neft|rtgs|imps/i.test(rawDesc) ? "Net Banking" : "Bank Transfer",
      account: "Primary Account",
      reference,
      runningBalance: runningBal,
      importSource: filename,
      confidence: catInfo.confidence,
      isReviewed: false,
      isExcluded: false,
      notes: "",
    });
  }

  // Sort chronologically
  transactions.sort((a, b) => a.date.localeCompare(b.date));

  return {
    transactions,
    observedOpeningBalance: observedOpening,
    observedClosingBalance: observedClosing,
    duplicateCount,
    transferCount,
    formatDetected: "Structured Statement (Table Profile)",
  };
}

export function parseGenericBankText(text: string, filename = "statement.txt"): ParseResult {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const transactions: Transaction[] = [];
  const seenHashes = new Set<string>();
  let duplicateCount = 0;
  let transferCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for date pattern at start or within line
    const dateMatch = line.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}\s+[A-Za-z]{3}\s+\d{2,4})\b/);
    if (!dateMatch) continue;

    // Strip date string before looking for amounts so date components aren't matched as amounts
    const lineWithoutDate = line.replace(dateMatch[0], " ").trim();

    // Look for numbers that represent amounts
    const amountMatches = [...lineWithoutDate.matchAll(/-?\b\d+(?:,\d+)*(?:\.\d+)?\b/g)]
      .map(m => m[0].replace(/,/g, ""))
      .filter(m => !isNaN(parseFloat(m)) && parseFloat(m) > 0);

    if (amountMatches.length === 0) continue;

    const date = normalizeDateString(dateMatch[0]);

    // Check if line indicates debit or credit
    const isCredit = /\b(credit|cr\b|deposit|salary|refund|interest|cr\.)/i.test(line);
    const isDebit = /\b(debit|dr\b|withdrawal|paid|spent|purchase|dr\.)/i.test(line);

    // If there is 1 number, it's the amount.
    // If there are multiple numbers, usually [amount, runningBalance] or [refNo, amount, runningBalance]
    let rawAmount = parseFloat(amountMatches[amountMatches.length - 1]);
    let runningBalance: number | undefined;

    if (amountMatches.length >= 2) {
      // If the last number looks like running balance (often large) and penultimate is amount
      rawAmount = parseFloat(amountMatches[amountMatches.length - 1]);
      // If debit/credit is explicitly followed by amount (e.g. "credit 120000"), amount is after that word
      const crDrMatch = lineWithoutDate.match(/\b(?:credit|cr|debit|dr|withdrawal|deposit)\s+(\d+(?:,\d+)*(?:\.\d+)?)/i);
      if (crDrMatch) {
        rawAmount = parseFloat(crDrMatch[1].replace(/,/g, ""));
      }
    }

    if (rawAmount === 0) continue;

    const netAmount = isCredit && !isDebit ? Math.abs(rawAmount) : -Math.abs(rawAmount);

    // Extract description by removing date and numeric amounts
    let desc = line
      .replace(dateMatch[0], "")
      .replace(new RegExp(String(rawAmount), "g"), "")
      .trim();

    if (runningBalance) {
      desc = desc.replace(new RegExp(String(runningBalance), "g"), "").trim();
    }
    if (!desc) desc = `Transaction ${i + 1}`;

    const txnHash = `${date}|${netAmount}|${desc.slice(0, 30).toLowerCase()}`;
    if (seenHashes.has(txnHash)) {
      duplicateCount++;
      continue;
    }
    seenHashes.add(txnHash);

    const isTransfer = isTransferTransaction(desc);
    if (isTransfer) transferCount++;

    const catInfo = categorizeTransaction(desc, netAmount);

    transactions.push({
      id: `txn_${i}_${Date.now().toString(36)}_${Math.abs(netAmount)}`,
      date,
      description: desc,
      merchant: catInfo.merchant,
      debit: netAmount < 0 ? Math.abs(netAmount) : 0,
      credit: netAmount > 0 ? netAmount : 0,
      amount: netAmount,
      type: isTransfer ? "transfer" : netAmount >= 0 ? "income" : "expense",
      category: catInfo.category,
      subcategory: catInfo.subcategory,
      paymentMethod: /upi/i.test(desc) ? "UPI" : "Bank Transfer",
      account: "Primary Account",
      reference: "",
      runningBalance,
      importSource: filename,
      confidence: catInfo.confidence,
      isReviewed: false,
      isExcluded: false,
      notes: "",
    });
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date));

  return {
    transactions,
    duplicateCount,
    transferCount,
    formatDetected: "Text Statement (Regex Pattern)",
  };
}
