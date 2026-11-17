import type { InsightReport } from "./schemas";
import { sumMoney } from "./money";

/** Deterministic answers that work in the APK without a server or API key. */
export function answerLocally(question: string, report: InsightReport): string {
  const q = question.toLowerCase();

  if (
    /spending most|highest spend|largest expense|where am i spending/.test(q)
  ) {
    const top = report.categories[0];
    const merchant = report.merchants[0];
    if (!top)
      return "No included expenses were found in this statement period.";
    return `Your highest spending category is ${top.name} at ${currency(top.amount)} (${top.percent}% of all expenses). Your largest merchant outflow is ${merchant?.merchant ?? "not detected"}, totaling ${currency(merchant?.amount ?? 0)} across ${merchant?.transactions ?? 0} transactions.`;
  }

  if (/food|swiggy|zomato|dining/.test(q)) {
    const category = report.categories.find((c) => /food|dining/i.test(c.name));
    const transactions = report.transactions.filter(
      (t) =>
        !t.isExcluded &&
        t.type === "expense" &&
        (/food|dining/i.test(t.category) ||
          /swiggy|zomato|restaurant|cafe/i.test(t.description)),
    );
    const total =
      category?.amount ?? sumMoney(transactions.map((t) => Math.abs(t.amount)));
    return `You spent ${currency(total)} on Food & Dining (${category?.percent ?? 0}% of total expenses). There are ${category?.transactionCount ?? transactions.length} included food transactions.`;
  }

  if (/subscription|recurring|cancel/.test(q)) {
    if (!report.subscriptions.length)
      return "No recurring subscriptions were detected in this statement period.";
    const largest = report.subscriptions[0];
    const annual = sumMoney(report.subscriptions.map((s) => s.annualCost));
    const monthly = sumMoney(report.subscriptions.map((s) => s.monthlyCost));
    return `You have ${report.subscriptions.length} detected recurring commitments totaling ${currency(monthly)}/month (${currency(annual)}/year). The largest is ${largest.merchant} at ${currency(largest.monthlyCost)}/month. Recommendation: ${largest.recommendation}`;
  }

  // Explain the cause before the general savings branch matches "savings rate".
  if (/decreasing|why.*savings|low savings/.test(q)) {
    const categories = report.categories
      .slice(0, 3)
      .map((c) => `${c.name} (${c.percent}%)`)
      .join(", ");
    const monthlyTop =
      ((report.categories[0]?.amount ?? 0) /
        Math.max(1, report.period.totalDays)) *
      30;
    return `Your savings rate is ${report.totals.savingsRate}%. The main expense drivers are ${categories || "not detected"}. Trimming 10% from the largest category would free approximately ${currency(monthlyTop * 0.1)}/month at the observed run-rate.`;
  }

  if (/next month|forecast|future/.test(q)) {
    return `Projected next-month expenses are ${currency(report.forecasting.nextMonthExpenses)} (estimated range: ${currency(report.forecasting.confidenceInterval.lower)}–${currency(report.forecasting.confidenceInterval.upper)}). Projected net savings are ${currency(report.forecasting.nextMonthSavings)}, and the estimated 90-day balance is ${currency(report.forecasting.futureBalance90Days)}. ${report.forecasting.explanation}`;
  }

  if (/sav(e|ing)|saved/.test(q)) {
    return `During ${report.period.startDate} to ${report.period.endDate}, net savings totaled ${currency(report.totals.netSavings)} with a ${report.totals.savingsRate}% savings rate (income: ${currency(report.totals.income)}, expenses: ${currency(report.totals.expenses)}). Transfers are excluded from income and expense totals.`;
  }

  if (/health|score/.test(q)) {
    const factors = report.health.breakdown
      .slice(0, 4)
      .map((b) => `${b.factor}: ${b.value}`)
      .join("; ");
    return `Your FinanceIQ Health Score is ${report.health.score}/100 (${report.health.label}). ${factors}. ${report.health.recommendations[0] ?? ""}`;
  }

  const category = report.categories.find((c) =>
    q.includes(c.name.toLowerCase()),
  );
  if (category)
    return `${category.name} spending totals ${currency(category.amount)} across ${category.transactionCount} included transactions (${category.percent}% of expenses).`;

  return `FinanceIQ Summary: income ${currency(report.totals.income)}, expenses ${currency(report.totals.expenses)}, and net savings ${currency(report.totals.netSavings)} (${report.totals.savingsRate}%). Health score: ${report.health.score}/100. Top category: ${report.categories[0]?.name ?? "None"} (${currency(report.categories[0]?.amount ?? 0)}).`;
}

function currency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}
