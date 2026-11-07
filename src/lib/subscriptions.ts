import { type Subscription, type Transaction } from "./schemas";

export function detectRecurringSubscriptions(transactions: Transaction[]): Subscription[] {
  // Only consider expense transactions (excluding transfers and income)
  const expenses = transactions.filter(t => t.type === "expense" && !t.isExcluded);

  // Group by merchant and similar description
  const groups = new Map<string, Transaction[]>();

  for (const txn of expenses) {
    const key = txn.merchant.trim().toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(txn);
  }

  const detected: Subscription[] = [];

  for (const [merchantKey, txns] of groups.entries()) {
    // Exclude housing/rent, insurance, loan EMI, investments from subscriptions
    if (/\b(rent|housing|insurance|lic|policy|emi|loan|sip|mutual fund)\b/i.test(merchantKey)) {
      continue;
    }
    if (txns.some(t => /\b(housing|insurance|debt|emi & loans|investments)\b/i.test(t.category))) {
      continue;
    }

    // Need at least 2 transactions to establish a recurring cadence
    if (txns.length < 2) continue;

    // Sort chronologically
    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));

    // Calculate intervals between consecutive occurrences
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prevDate = new Date(sorted[i - 1].date).getTime();
      const currDate = new Date(sorted[i].date).getTime();
      const diffDays = Math.round((currDate - prevDate) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) intervals.push(diffDays);
    }

    if (intervals.length === 0) continue;

    // Calculate mean interval
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

    // Calculate amount stability
    const amounts = sorted.map(t => Math.abs(t.amount));
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((acc, a) => acc + Math.pow(a - avgAmount, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);
    const amountCoeffVar = avgAmount > 0 ? stdDev / avgAmount : 0;

    // Known subscription keywords or merchants
    const isKnownSubscription = /\b(netflix|spotify|prime|youtube|hotstar|apple|google|adobe|dropbox|canva|notion|zoom|linkedin|github|icloud|patreon|medium|openai|gym|fitness|broadband|airtel|jio|wifi)\b/i.test(merchantKey);

    // Determine cadence
    let frequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "annual" | null = null;
    let confidence = 0.6;

    if (avgInterval >= 5 && avgInterval <= 9) {
      frequency = "weekly";
      confidence = 0.85;
    } else if (avgInterval >= 12 && avgInterval <= 16) {
      frequency = "biweekly";
      confidence = 0.82;
    } else if (avgInterval >= 25 && avgInterval <= 35) {
      frequency = "monthly";
      confidence = isKnownSubscription ? 0.95 : (amountCoeffVar < 0.2 ? 0.9 : 0.75);
    } else if (avgInterval >= 80 && avgInterval <= 100) {
      frequency = "quarterly";
      confidence = 0.8;
    } else if (avgInterval >= 340 && avgInterval <= 380) {
      frequency = "annual";
      confidence = 0.78;
    } else if (isKnownSubscription) {
      // Even if intervals fluctuate slightly, known subscription brand detected
      frequency = "monthly";
      confidence = 0.88;
    }

    if (!frequency) continue;

    // Skip if amount varies wildy (> 50%) unless it's a known utility or streaming service
    if (amountCoeffVar > 0.5 && !isKnownSubscription) continue;

    // Calculate annual and monthly normalized cost
    let monthlyCost = Math.round(avgAmount);
    let annualCost = Math.round(avgAmount * 12);

    if (frequency === "weekly") {
      monthlyCost = Math.round(avgAmount * 4.33);
      annualCost = Math.round(avgAmount * 52);
    } else if (frequency === "biweekly") {
      monthlyCost = Math.round(avgAmount * 2.16);
      annualCost = Math.round(avgAmount * 26);
    } else if (frequency === "quarterly") {
      monthlyCost = Math.round(avgAmount / 3);
      annualCost = Math.round(avgAmount * 4);
    } else if (frequency === "annual") {
      monthlyCost = Math.round(avgAmount / 12);
      annualCost = Math.round(avgAmount);
    }

    const lastTxn = sorted[sorted.length - 1];
    const nextPaymentDate = computeNextDueDate(lastTxn.date, frequency);

    const displayName = sorted[0].merchant;
    const recommendation =
      monthlyCost > 2000
        ? "High recurring commitment. Review active utilization or downgrade tier."
        : annualCost > 10000
        ? "Consider annual billing discount if planning to retain for 12+ months."
        : "Routine subscription. Verify you still use this service monthly.";

    detected.push({
      id: `sub_${merchantKey.replace(/[^a-z0-9]/g, "_")}`,
      merchant: displayName,
      amount: Math.round(avgAmount),
      frequency,
      confidence,
      lastPaymentDate: lastTxn.date,
      nextPaymentDate,
      annualCost,
      monthlyCost,
      recommendation,
      explanation: `Detected ${sorted.length} charges averaging ₹${Math.round(avgAmount).toLocaleString("en-IN")} roughly every ${Math.round(avgInterval)} days (${frequency} cadence).`,
      isConfirmed: false,
    });
  }

  // Sort by highest annual cost first
  return detected.sort((a, b) => b.annualCost - a.annualCost);
}

function computeNextDueDate(lastDateStr: string, frequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "annual"): string {
  const [year, month, day] = lastDateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (frequency === "weekly") {
    date.setUTCDate(date.getUTCDate() + 7);
  } else if (frequency === "biweekly") {
    date.setUTCDate(date.getUTCDate() + 14);
  } else if (frequency === "monthly") {
    date.setUTCMonth(date.getUTCMonth() + 1);
  } else if (frequency === "quarterly") {
    date.setUTCMonth(date.getUTCMonth() + 3);
  } else if (frequency === "annual") {
    date.setUTCFullYear(date.getUTCFullYear() + 1);
  }

  return date.toISOString().slice(0, 10);
}
