import { transactionFingerprint, type ParseResult } from "./bank-parsers";
import type { Transaction } from "./schemas";
import { MAX_TRANSACTIONS } from "./upload-validation";

/** Preserve repeated cash purchases while collapsing overlapping statements. */
export function mergeStatements(results: ParseResult[]): ParseResult {
  const transactions: Transaction[] = [];
  const occurrenceCounts = new Map<string, number>();
  let duplicateCount = 0;
  for (const result of results) {
    duplicateCount += result.duplicateCount;
    const currentCounts = new Map<string, number>();
    for (const transaction of result.transactions) {
      const key = transactionFingerprint(transaction);
      const occurrence = (currentCounts.get(key) ?? 0) + 1;
      currentCounts.set(key, occurrence);
      if (occurrence > (occurrenceCounts.get(key) ?? 0))
        transactions.push(transaction);
      else duplicateCount++;
    }
    for (const [key, count] of currentCounts)
      occurrenceCounts.set(
        key,
        Math.max(count, occurrenceCounts.get(key) ?? 0),
      );
    if (transactions.length > MAX_TRANSACTIONS)
      throw new Error("Import at most 10,000 transactions at a time.");
  }
  transactions.sort((a, b) => a.date.localeCompare(b.date));
  const populated = results.filter((result) => result.transactions.length);
  const first = [...populated].sort((a, b) =>
    a.transactions[0].date.localeCompare(b.transactions[0].date),
  )[0];
  const last = [...populated].sort((a, b) =>
    b.transactions[b.transactions.length - 1].date.localeCompare(
      a.transactions[a.transactions.length - 1].date,
    ),
  )[0];
  return {
    transactions,
    duplicateCount,
    transferCount: transactions.filter(
      (transaction) => transaction.type === "transfer",
    ).length,
    observedOpeningBalance: first?.observedOpeningBalance,
    observedClosingBalance: last?.observedClosingBalance,
    formatDetected: populated
      .map((result) => result.formatDetected)
      .join(" / "),
  };
}
