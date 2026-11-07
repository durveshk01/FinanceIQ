import { type HealthScore, type Subscription, type Transaction } from "./schemas";

export type HealthScoreInput = {
  income: number;
  expenses: number;
  netSavings: number;
  savingsRate: number;
  fixedExpenses: number;
  debtExpenses: number;
  closingBalance: number;
  subscriptions: Subscription[];
  transactions: Transaction[];
  periodDays: number;
};

export function calculateFinancialHealthScore(input: HealthScoreInput): HealthScore {
  const {
    income,
    expenses,
    savingsRate,
    fixedExpenses,
    debtExpenses,
    closingBalance,
    subscriptions,
    transactions,
    periodDays,
  } = input;

  const monthlyIncome = periodDays > 0 ? (income / periodDays) * 30 : income;
  const monthlyExpenses = periodDays > 0 ? (expenses / periodDays) * 30 : expenses;

  // 1. Savings Rate Score (Weight: 25%)
  let savingsScore = 40;
  let savingsImpact: "positive" | "neutral" | "negative" = "neutral";
  if (savingsRate >= 30) {
    savingsScore = 100;
    savingsImpact = "positive";
  } else if (savingsRate >= 20) {
    savingsScore = 85;
    savingsImpact = "positive";
  } else if (savingsRate >= 10) {
    savingsScore = 65;
    savingsImpact = "neutral";
  } else if (savingsRate >= 0) {
    savingsScore = 40;
    savingsImpact = "negative";
  } else {
    savingsScore = 15;
    savingsImpact = "negative";
  }

  // 2. Fixed Expense Burden (Weight: 20%)
  const fixedRatio = monthlyIncome > 0 ? fixedExpenses / monthlyIncome : 0.6;
  let fixedScore = 50;
  let fixedImpact: "positive" | "neutral" | "negative" = "neutral";
  if (fixedRatio <= 0.40) {
    fixedScore = 95;
    fixedImpact = "positive";
  } else if (fixedRatio <= 0.50) {
    fixedScore = 80;
    fixedImpact = "positive";
  } else if (fixedRatio <= 0.65) {
    fixedScore = 55;
    fixedImpact = "neutral";
  } else {
    fixedScore = 25;
    fixedImpact = "negative";
  }

  // 3. Debt Service Burden (Weight: 20%)
  const debtRatio = monthlyIncome > 0 ? debtExpenses / monthlyIncome : 0;
  let debtScore = 100;
  let debtImpact: "positive" | "neutral" | "negative" = "positive";
  if (debtExpenses === 0) {
    debtScore = 100;
    debtImpact = "positive";
  } else if (debtRatio <= 0.15) {
    debtScore = 85;
    debtImpact = "positive";
  } else if (debtRatio <= 0.30) {
    debtScore = 60;
    debtImpact = "neutral";
  } else if (debtRatio <= 0.45) {
    debtScore = 35;
    debtImpact = "negative";
  } else {
    debtScore = 15;
    debtImpact = "negative";
  }

  // 4. Emergency Reserve Buffer (Weight: 15%)
  const reserveMonths = monthlyExpenses > 0 ? Math.max(0, closingBalance) / monthlyExpenses : 1;
  let reserveScore = 50;
  let reserveImpact: "positive" | "neutral" | "negative" = "neutral";
  if (reserveMonths >= 6) {
    reserveScore = 100;
    reserveImpact = "positive";
  } else if (reserveMonths >= 3) {
    reserveScore = 80;
    reserveImpact = "positive";
  } else if (reserveMonths >= 1) {
    reserveScore = 55;
    reserveImpact = "neutral";
  } else {
    reserveScore = 25;
    reserveImpact = "negative";
  }

  // 5. Subscription Creep Index (Weight: 10%)
  const totalMonthlySub = subscriptions.reduce((acc, s) => acc + s.monthlyCost, 0);
  const subRatio = monthlyIncome > 0 ? totalMonthlySub / monthlyIncome : 0.05;
  let subScore = 80;
  let subImpact: "positive" | "neutral" | "negative" = "neutral";
  if (subRatio <= 0.05) {
    subScore = 95;
    subImpact = "positive";
  } else if (subRatio <= 0.10) {
    subScore = 80;
    subImpact = "positive";
  } else if (subRatio <= 0.18) {
    subScore = 50;
    subImpact = "neutral";
  } else {
    subScore = 25;
    subImpact = "negative";
  }

  // 6. Cash Flow Volatility (Weight: 10%)
  // Evaluate weekly spend variance
  const weeklyTotals: number[] = [];
  const weeklyMap = new Map<string, number>();
  for (const t of transactions.filter(t => t.type === "expense")) {
    const weekKey = t.date.slice(0, 7); // Monthly/weekly cohort
    weeklyMap.set(weekKey, (weeklyMap.get(weekKey) || 0) + Math.abs(t.amount));
  }
  for (const val of weeklyMap.values()) weeklyTotals.push(val);

  let volatilityScore = 75;
  let volatilityImpact: "positive" | "neutral" | "negative" = "neutral";
  if (weeklyTotals.length >= 2) {
    const avg = weeklyTotals.reduce((a, b) => a + b, 0) / weeklyTotals.length;
    const std = Math.sqrt(weeklyTotals.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / weeklyTotals.length);
    const cv = avg > 0 ? std / avg : 0;
    if (cv < 0.25) {
      volatilityScore = 90;
      volatilityImpact = "positive";
    } else if (cv < 0.5) {
      volatilityScore = 75;
      volatilityImpact = "neutral";
    } else {
      volatilityScore = 45;
      volatilityImpact = "negative";
    }
  }

  // Weighted composite score calculation
  const compositeScore = Math.round(
    savingsScore * 0.25 +
    fixedScore * 0.20 +
    debtScore * 0.20 +
    reserveScore * 0.15 +
    subScore * 0.10 +
    volatilityScore * 0.10
  );

  let label = "Balanced Resilience";
  if (compositeScore >= 85) label = "Exceptional Financial Health";
  else if (compositeScore >= 70) label = "Strong Financial Health";
  else if (compositeScore >= 55) label = "Moderate / Balanced";
  else if (compositeScore >= 40) label = "Caution / Vulnerable";
  else label = "Urgent Attention Needed";

  const recommendations: string[] = [];
  if (savingsScore < 70) {
    recommendations.push(`Target raising your monthly savings rate from ${savingsRate}% to at least 20% by setting up automatic SIPs on salary day.`);
  }
  if (fixedScore < 70) {
    recommendations.push(`Fixed obligations consume ${(fixedRatio * 100).toFixed(0)}% of your income. Look to renegotiate recurring bills and discretionary housing overhead.`);
  }
  if (debtScore < 70) {
    recommendations.push(`Debt and EMI payments account for ${(debtRatio * 100).toFixed(0)}% of earnings. Prioritize accelerated principal repayment on highest-interest loans.`);
  }
  if (reserveScore < 70) {
    recommendations.push(`Your liquid reserve covers roughly ${reserveMonths.toFixed(1)} months of expenses. Build towards a 3-to-6 month buffer in high-yield liquid accounts.`);
  }
  if (subScore < 70) {
    recommendations.push(`Active subscriptions total ₹${totalMonthlySub.toLocaleString("en-IN")}/mo. Audit unused apps or duplicate streaming platforms to free up capital.`);
  }
  if (recommendations.length === 0) {
    recommendations.push("Your financial baseline is well disciplined. Consider shifting surplus liquid cash into diversified long-term wealth assets.");
  }

  return {
    score: Math.max(1, Math.min(100, compositeScore)),
    label,
    breakdown: [
      {
        factor: "Savings Rate",
        score: savingsScore,
        weight: 0.25,
        value: `${savingsRate}% of income`,
        impact: savingsImpact,
        description: "Proportion of total income preserved as liquid or invested savings.",
      },
      {
        factor: "Fixed Expense Burden",
        score: fixedScore,
        weight: 0.20,
        value: `${Math.round(fixedRatio * 100)}% of income`,
        impact: fixedImpact,
        description: "Committed non-negotiable costs (housing, utilities, fuel, groceries).",
      },
      {
        factor: "Debt Service Ratio",
        score: debtScore,
        weight: 0.20,
        value: debtExpenses > 0 ? `${Math.round(debtRatio * 100)}% of income` : "Zero debt detected",
        impact: debtImpact,
        description: "Portion of inflows allocated to debt service, EMIs, and interest.",
      },
      {
        factor: "Emergency Buffer",
        score: reserveScore,
        weight: 0.15,
        value: `${reserveMonths.toFixed(1)} months coverage`,
        impact: reserveImpact,
        description: "Liquid runway available to absorb unforeseen shocks or income pauses.",
      },
      {
        factor: "Subscription Creep",
        score: subScore,
        weight: 0.10,
        value: `₹${totalMonthlySub.toLocaleString("en-IN")}/mo (${subscriptions.length} recurring)`,
        impact: subImpact,
        description: "Monthly recurring services and micro-commitments.",
      },
      {
        factor: "Cash Flow Stability",
        score: volatilityScore,
        weight: 0.10,
        value: volatilityScore >= 80 ? "Consistent weekly rhythm" : "Fluctuating weekly outflows",
        impact: volatilityImpact,
        description: "Predictability and smoothness of week-on-week discretionary outflows.",
      },
    ],
    methodology: "Weighted 6-pillar financial resilience framework evaluated on empirical transaction history.",
    period: `${periodDays} days observed`,
    recommendations,
  };
}
