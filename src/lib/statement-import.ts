import { transactionFingerprint, type ParseResult } from "./bank-parsers";
import type { Transaction } from "./schemas";
import { MAX_TRANSACTIONS } from "./upload-validation";

/** Preserve repeated cash purchases while collapsing overlapping statements. */
export function mergeStatements(results: ParseResult[]): ParseResult {
  const transactions: Transaction[] = [];
  const occurrenceCounts = new Map<string, number>();
  const nodes = new Map<string, Transaction>();
  const successors = new Map<Transaction, Set<Transaction>>();
  const predecessors = new Map<Transaction, number>();
  let duplicateCount = 0;
  for (const result of results) {
    duplicateCount += result.duplicateCount;
    const currentCounts = new Map<string, number>();
    let previous: Transaction | undefined;
    for (const transaction of result.transactions) {
      const key = transactionFingerprint(transaction);
      const occurrence = (currentCounts.get(key) ?? 0) + 1;
      currentCounts.set(key, occurrence);
      const nodeKey = JSON.stringify([key, occurrence]);
      if (occurrence > (occurrenceCounts.get(key) ?? 0)) {
        transactions.push(transaction);
        nodes.set(nodeKey, transaction);
        successors.set(transaction, new Set());
        predecessors.set(transaction, 0);
      } else duplicateCount++;
      const current = nodes.get(nodeKey)!;
      // Each source supplies bank order within a date. Keep that order when
      // overlapping files contribute rows on either side of a shared row.
      if (previous && previous.date === current.date) {
        const next = successors.get(previous)!;
        if (!next.has(current)) {
          next.add(current);
          predecessors.set(current, predecessors.get(current)! + 1);
        }
      }
      previous = current;
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
  const ready = transactions.filter(
    (transaction) => predecessors.get(transaction) === 0,
  );
  const ordered: Transaction[] = [];
  for (let index = 0; index < ready.length; index++) {
    const transaction = ready[index];
    ordered.push(transaction);
    for (const next of successors.get(transaction)!) {
      const remaining = predecessors.get(next)! - 1;
      predecessors.set(next, remaining);
      if (remaining === 0) ready.push(next);
    }
  }
  if (ordered.length !== transactions.length)
    throw new Error(
      "Overlapping statements disagree on same-day transaction order. Import them separately and review the bank rows.",
    );
  ordered.sort((a, b) => a.date.localeCompare(b.date));
  transactions.splice(0, transactions.length, ...ordered);
  const populated = results.filter((result) => result.transactions.length);
  const first = populated.find(
    (result) =>
      result.observedOpeningBalance !== undefined &&
      transactionFingerprint(result.transactions[0]) ===
        transactionFingerprint(transactions[0]),
  );
  const last = populated.find(
    (result) =>
      result.observedClosingBalance !== undefined &&
      transactionFingerprint(result.transactions.at(-1)!) ===
        transactionFingerprint(transactions.at(-1)!),
  );
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
