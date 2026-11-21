import {
  type InsightReport,
  type Transaction,
  type Subscription,
  type FinancialGoal,
} from "./schemas";
import { categorizeTransaction, extractMerchant } from "./categorizer";
import {
  parseGenericBankText,
  parseCsvRows,
  parseStructuredTable,
} from "./bank-parsers";
import { detectRecurringSubscriptions } from "./subscriptions";
import { calculateFinancialHealthScore } from "./health-score";
import { generateFinancialForecast } from "./forecasting";
import { generateDefaultGoals, runSpendingSimulation } from "./goal-planner";
import { roundMoney, sumMoney } from "./money";
import { transactionSchema, financialGoalSchema } from "./schemas";

export * from "./schemas";
export { categorizeTransaction, extractMerchant } from "./categorizer";
export {
  parseGenericBankText,
  parseCsvRows,
  parseStructuredTable,
} from "./bank-parsers";

// Backward-compatible categorization function
export function categorize(description: string, amount: number): string {
  const res = categorizeTransaction(description, amount);
  // Map internal categories to match any legacy test expectations if needed
  if (res.category === "Food & Dining") return "Food";
  if (res.category === "Transportation") return "Transport";
  if (res.category === "Healthcare") return "Health";
  if (res.category === "EMI & Loans") return "Debt";
  return res.category;
}

export function merchantFromDescription(description: string): string {
  return extractMerchant(description);
}

export function parseTransactionsFromText(
  text: string,
  filename = "statement.txt",
): Transaction[] {
  // Check if text appears to be CSV format
  if (/[,;\t|]/.test(text)) {
    const rows = parseCsvRows(text);
    if (rows.length >= 2) {
      const parsed = parseStructuredTable(rows, filename);
      if (parsed.transactions.length > 0) {
        return parsed.transactions;
      }
    }
  }

  // Fallback to robust line-by-line bank statement parsing
  const parsed = parseGenericBankText(text, filename);
  return parsed.transactions;
}

export function demoTransactions(): Transaction[] {
  const merchants = [
    ["ACME Tech Corp Monthly Payroll", 145000, "Salary", "income"],
    ["Swiggy Gourmet Delivery", -1280, "Food & Dining", "expense"],
    ["Amazon India Electronics", -4300, "Shopping", "expense"],
    ["Netflix Standard Subscription", -649, "Entertainment", "expense"],
    ["Uber City Ride", -760, "Transportation", "expense"],
    ["Airtel Fiber Broadband Bill", -1199, "Utilities", "expense"],
    ["Groww Nifty 50 Index Fund SIP", -15000, "Investments", "expense"],
    ["Zomato Food Delivery", -920, "Food & Dining", "expense"],
    ["Blinkit Instant Groceries", -1450, "Groceries", "expense"],
    ["D-Mart Supermarket Provisions", -4800, "Groceries", "expense"],
    ["HDFC Bank Home Loan EMI", -28400, "EMI & Loans", "expense"],
    ["BookMyShow IMAX Weekend", -1600, "Entertainment", "expense"],
    ["Apollo Pharmacy Medicines", -1450, "Healthcare", "expense"],
    ["Indian Oil Fuel Station", -2500, "Fuel", "expense"],
    ["Urban Nest Apartment Maintenance", -4500, "Housing", "expense"],
    ["HDFC Life Term Insurance", -5200, "Insurance", "expense"],
    ["Spotify Premium Duo", -149, "Entertainment", "expense"],
    ["Zerodha Stock Demat Investment", -10000, "Investments", "expense"],
  ] as const;

  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const txns: Transaction[] = [];

  for (let i = 0; i < 90; i++) {
    const date = new Date(today.getTime() - (89 - i) * 86400000);
    const day = date.getUTCDate();
    // Salary and subscriptions follow calendar-month cadences in the demo.
    const expenseMerchants = merchants.filter(
      (m) =>
        !["Salary", "Entertainment"].includes(m[2]) || /BookMyShow/.test(m[0]),
    );
    const item =
      day === 1
        ? merchants[0]
        : day === 5
          ? merchants[3]
          : day === 7
            ? merchants[16]
            : expenseMerchants[i % expenseMerchants.length];
    const dateString = date.toISOString().slice(0, 10);

    const baseAmt = item[1];
    // Add realistic variation
    const variation =
      baseAmt < 0 && !/Netflix|Spotify/.test(item[0])
        ? -Math.round(Math.abs(baseAmt) * (0.85 + (i % 7) * 0.05))
        : baseAmt;

    const isExpense = variation < 0;
    const cat = categorizeTransaction(item[0], variation).category;

    txns.push({
      id: `demo_${i}_${Date.now().toString(36)}`,
      date: dateString,
      description: item[0],
      merchant: extractMerchant(item[0]),
      debit: isExpense ? Math.abs(variation) : 0,
      credit: !isExpense ? variation : 0,
      amount: variation,
      type: isExpense ? "expense" : "income",
      category: cat,
      subcategory: "Demo",
      paymentMethod:
        i % 3 === 0 ? "UPI" : i % 3 === 1 ? "Debit Card" : "Net Banking",
      account: "Primary Checking",
      reference: `REF${100000 + i}`,
      importSource: "demo-dataset",
      confidence: 0.95,
      isReviewed: true,
      isExcluded: false,
      notes: "Sample verified demo transaction",
    });
  }

  let balance = 120000;
  for (const transaction of txns) {
    balance = roundMoney(balance + transaction.amount);
    transaction.runningBalance = balance;
  }
  return txns;
}

export type ReportMetadata = {
  fileNames?: string[];
  duplicatesRemoved?: number;
  openingBalance?: number;
  closingBalance?: number;
  goals?: FinancialGoal[];
};

export function buildReport(
  transactions: Transaction[],
  metadata?: ReportMetadata,
): InsightReport {
  const verifiedTxns = transactions
    .map((t) => transactionSchema.parse(t))
    .sort((a, b) => a.date.localeCompare(b.date));
  const activeTxns = verifiedTxns.filter((t) => !t.isExcluded);

  // Decimal-safe sum
  const expenses = sumMoney(
    activeTxns
      .filter((t) => t.type === "expense")
      .map((t) => Math.abs(t.amount)),
  );

  const income = sumMoney(
    activeTxns
      .filter((t) => t.type === "income")
      .map((t) => Math.abs(t.amount)),
  );

  const transfers = sumMoney(
    activeTxns
      .filter((t) => t.type === "transfer")
      .map((t) => Math.abs(t.amount)),
  );

  const netSavings = roundMoney(income - expenses);
  const savingsRate = income > 0 ? Math.round((netSavings / income) * 100) : 0;

  // Calculate unique days and date range
  const dates = [...new Set(verifiedTxns.map((t) => t.date))].sort();
  const startDate = dates[0] || new Date().toISOString().slice(0, 10);
  const endDate = dates[dates.length - 1] || startDate;
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const periodDays = Math.max(
    1,
    Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1,
  );

  // Group by category
  const catTotals = new Map<string, { amount: number; count: number }>();
  for (const t of activeTxns.filter((t) => t.type === "expense")) {
    const cur = catTotals.get(t.category) || { amount: 0, count: 0 };
    catTotals.set(t.category, {
      amount: roundMoney(cur.amount + Math.abs(t.amount)),
      count: cur.count + 1,
    });
  }

  const categories = [...catTotals.entries()]
    .map(([name, val]) => ({
      name,
      amount: val.amount,
      percent: expenses > 0 ? Math.round((val.amount / expenses) * 100) : 0,
      transactionCount: val.count,
    }))
    .sort((a, b) => b.amount - a.amount);

  // Group by top merchants
  const merchantTotals = new Map<string, { amount: number; count: number }>();
  for (const t of activeTxns.filter((t) => t.type === "expense")) {
    const cur = merchantTotals.get(t.merchant) || { amount: 0, count: 0 };
    merchantTotals.set(t.merchant, {
      amount: roundMoney(cur.amount + Math.abs(t.amount)),
      count: cur.count + 1,
    });
  }

  const merchants = [...merchantTotals.entries()]
    .map(([merchant, val]) => ({
      merchant,
      amount: val.amount,
      transactions: val.count,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  // Detect Subscriptions
  const subscriptions = detectRecurringSubscriptions(activeTxns);

  // Weekend vs Weekday analysis
  const weekendVsWeekday = activeTxns
    .filter((t) => t.type === "expense")
    .reduce(
      (acc, t) => {
        const d = new Date(`${t.date}T00:00:00.000Z`).getUTCDay();
        if (d === 0 || d === 6)
          acc.weekend = roundMoney(acc.weekend + Math.abs(t.amount));
        else acc.weekday = roundMoney(acc.weekday + Math.abs(t.amount));
        return acc;
      },
      { weekend: 0, weekday: 0 },
    );

  // Fixed and debt expenses for health score
  const fixedCategories = new Set([
    "Housing",
    "Utilities",
    "Insurance",
    "Fuel",
    "Groceries",
  ]);
  const fixedExpenses = categories
    .filter((c) => fixedCategories.has(c.name))
    .reduce((acc, c) => acc + c.amount, 0);

  const debtExpenses = categories
    .filter((c) => c.name === "EMI & Loans" || c.name === "Debt")
    .reduce((acc, c) => acc + c.amount, 0);

  // Observed vs Calculated Balances
  const firstBalanceIndex = verifiedTxns.findIndex(
    (t) => t.runningBalance !== undefined,
  );
  const observedOpening = metadata?.openingBalance;
  const inferredOpening =
    firstBalanceIndex >= 0
      ? roundMoney(
          verifiedTxns[firstBalanceIndex].runningBalance! -
            sumMoney(
              verifiedTxns.slice(0, firstBalanceIndex + 1).map((t) => t.amount),
            ),
        )
      : undefined;
  const observedClosing =
    metadata?.closingBalance ?? verifiedTxns.at(-1)?.runningBalance;
  const openingAmount = observedOpening ?? inferredOpening ?? 0;
  // Transfers move the balance of this account even when they are excluded
  // from spending. Exclusion changes analysis, not observed bank movements.
  const calculatedClosing = roundMoney(
    openingAmount + sumMoney(verifiedTxns.map((t) => t.amount)),
  );
  const closingAmount = observedClosing ?? calculatedClosing;

  // Calculate Health Score
  const health = calculateFinancialHealthScore({
    income,
    expenses,
    netSavings,
    savingsRate,
    fixedExpenses,
    debtExpenses,
    closingBalance: closingAmount,
    subscriptions,
    transactions: activeTxns,
    periodDays,
  });

  // Forecasting
  const forecasting = generateFinancialForecast(
    activeTxns,
    netSavings,
    closingAmount,
    periodDays,
  );

  // Goal Planner
  const monthlyIncome = Math.round((income / periodDays) * 30);
  const monthlyExpenses = Math.round((expenses / periodDays) * 30);
  const goals = metadata?.goals
    ? metadata.goals.map((goal) => financialGoalSchema.parse(goal))
    : generateDefaultGoals(
        monthlyIncome,
        monthlyExpenses,
        roundMoney((netSavings / periodDays) * 30),
        Math.max(0, closingAmount),
      );

  // Spending Simulator Scenarios
  const simulationScenarios = runSpendingSimulation(
    monthlyIncome,
    monthlyExpenses,
    closingAmount,
  );

  // Trends
  const dailyTrend = buildDailyTrend(activeTxns);
  const weeklyTrend = buildWeeklyTrend(activeTxns);

  // Salary detection
  const salary = detectSalary(activeTxns);

  // Alerts
  const alerts = buildRiskAlerts(
    categories,
    subscriptions,
    income,
    expenses,
    debtExpenses,
  );
  if (
    observedClosing !== undefined &&
    Math.abs(observedClosing - calculatedClosing) > 0.02
  ) {
    alerts.unshift({
      severity: "high",
      title: "Balance Reconciliation Difference",
      detail: `Observed closing and calculated closing differ by ₹${roundMoney(observedClosing - calculatedClosing).toLocaleString("en-IN")}. Review missing rows, account boundaries, or statement order.`,
    });
  }

  // Personality & lifestyle
  const personality = determinePersonality(savingsRate, categories);

  const totalTxnCount = activeTxns.length;
  const avgTxnValue =
    totalTxnCount > 0
      ? Math.round(
          expenses /
            Math.max(1, activeTxns.filter((t) => t.type === "expense").length),
        )
      : 0;

  return {
    generatedAt: new Date().toISOString(),
    period: {
      startDate,
      endDate,
      totalDays: periodDays,
    },
    balances: {
      opening: {
        amount: openingAmount,
        source:
          observedOpening !== undefined
            ? "observed"
            : inferredOpening !== undefined
              ? "calculated"
              : "estimated",
        confidence:
          observedOpening !== undefined
            ? 1
            : inferredOpening !== undefined
              ? 0.9
              : 0,
        note:
          observedOpening !== undefined
            ? "Opening balance stated by the bank"
            : inferredOpening !== undefined
              ? "Derived from the first running balance minus preceding account movements"
              : "No opening balance supplied; zero baseline for cash-flow analysis",
      },
      closing: {
        amount: closingAmount,
        source: observedClosing !== undefined ? "observed" : "calculated",
        confidence: observedClosing !== undefined ? 1 : 0.85,
        note:
          observedClosing !== undefined
            ? "Directly extracted from statement"
            : "Computed from net cash flow",
      },
      calculatedClosing: {
        amount: calculatedClosing,
        source: "calculated",
        confidence: 0.95,
        note: "Opening balance plus all statement account movements, including transfers",
      },
    },
    totals: {
      income,
      expenses,
      transfers,
      netSavings,
      savingsRate,
      averageDailySpend: Math.round(expenses / periodDays),
      totalTransactions: totalTxnCount,
      averageTransactionValue: avgTxnValue,
    },
    health,
    lifestyle: {
      personality,
      summary: personalitySummary(personality),
    },
    categories,
    dailyTrend,
    weeklyTrend,
    merchants,
    subscriptions,
    opportunities: buildOpportunities(
      categories,
      subscriptions,
      monthlyExpenses,
      periodDays,
    ),
    alerts,
    bills: subscriptions.map((s) => ({
      merchant: s.merchant,
      amount: s.monthlyCost,
      predictedDate: s.nextPaymentDate,
    })),
    forecasting,
    weekendVsWeekday,
    salary,
    goals,
    simulationScenarios,
    coachTips: [
      `Automate a ${Math.max(10, Math.min(30, savingsRate + 5))}% monthly deposit into liquid assets right on salary day.`,
      `Your largest outlay is ${categories[0]?.name ?? "discretionary spending"} (${categories[0]?.percent ?? 0}%). Even a 10% trim saves ₹${Math.round((categories[0]?.amount ?? 0) * 0.1).toLocaleString("en-IN")}.`,
      "Review your recurring subscriptions before next billing cycle to avoid inactive renewals.",
      "Maintain a 6-month liquid cushion in risk-free accounts before taking aggressive speculative exposure.",
    ],
    transactions: verifiedTxns,
    importSummary: {
      totalParsed: transactions.length,
      duplicatesRemoved: metadata?.duplicatesRemoved ?? 0,
      transfersIdentified: activeTxns.filter((t) => t.type === "transfer")
        .length,
      fileNames: metadata?.fileNames || ["uploaded-statement"],
    },
  };
}

function buildDailyTrend(transactions: Transaction[]) {
  const map = new Map<string, number>();
  for (const t of transactions.filter((t) => t.type === "expense")) {
    map.set(t.date, roundMoney((map.get(t.date) || 0) + Math.abs(t.amount)));
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount }));
}

function buildWeeklyTrend(transactions: Transaction[]) {
  const map = new Map<string, number>();
  for (const t of transactions.filter((t) => t.type === "expense")) {
    const d = new Date(`${t.date}T00:00:00.000Z`);
    const weekStart = new Date(d);
    weekStart.setUTCDate(d.getUTCDate() - d.getUTCDay());
    const weekKey = weekStart.toISOString().slice(0, 10);
    map.set(weekKey, roundMoney((map.get(weekKey) || 0) + Math.abs(t.amount)));
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, amount]) => ({ week, amount }));
}

function detectSalary(transactions: Transaction[]) {
  const salaryTxns = transactions.filter(
    (t) =>
      t.type === "income" &&
      /salary|payroll|stipend|wages|employer/i.test(
        `${t.description} ${t.category}`,
      ),
  );
  const highestIncome = transactions
    .filter((t) => t.type === "income")
    .sort((a, b) => b.amount - a.amount)[0];
  const chosen = salaryTxns[0] ?? highestIncome;

  return {
    detected: Boolean(chosen),
    merchant: chosen ? chosen.merchant : "Not detected",
    amount: chosen ? chosen.amount : 0,
    cadence:
      salaryTxns.length > 1
        ? "Predictable monthly salary cadence"
        : "Single verified deposit detected",
    trend:
      salaryTxns.length > 1
        ? "Stable recurring income"
        : "Requires additional statements for historical growth trend",
  };
}

function buildRiskAlerts(
  categories: { name: string; amount: number; percent: number }[],
  subscriptions: Subscription[],
  income: number,
  expenses: number,
  debtExpenses: number,
): InsightReport["alerts"] {
  const alerts: InsightReport["alerts"] = [];

  if (expenses > income * 0.9) {
    alerts.push({
      severity: "high",
      title: "High Outflow Ratio",
      detail: `Expenses account for ${Math.round((expenses / (income || 1)) * 100)}% of detected inflows, leaving slim savings headroom.`,
    });
  }

  if (debtExpenses > expenses * 0.25) {
    alerts.push({
      severity: "high",
      title: "Debt & EMI Concentration",
      detail: `Debt and EMI obligations consume ${Math.round((debtExpenses / expenses) * 100)}% of monthly expenditures.`,
    });
  }

  if (subscriptions.length >= 4) {
    const subSum = subscriptions.reduce((a, s) => a + s.annualCost, 0);
    alerts.push({
      severity: "medium",
      title: "Subscription Proliferation",
      detail: `${subscriptions.length} recurring subscriptions detected totaling ₹${subSum.toLocaleString("en-IN")}/year.`,
    });
  }

  const topCategory = categories[0];
  if (topCategory && topCategory.percent > 35) {
    alerts.push({
      severity: "medium",
      title: "Category Concentration Risk",
      detail: `${topCategory.name} represents ${topCategory.percent}% of total monthly spend.`,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      severity: "low",
      title: "Balanced Cash Outflows",
      detail:
        "No critical volatility anomalies or excessive expense concentrations detected.",
    });
  }

  return alerts;
}

function buildOpportunities(
  categories: { name: string; amount: number; percent: number }[],
  subscriptions: Subscription[],
  monthlyExpenses: number,
  periodDays: number,
) {
  const top = categories[0];
  const monthlyTop = ((top?.amount ?? 0) / Math.max(1, periodDays)) * 30;
  const subSavings = Math.round(
    subscriptions.reduce((a, s) => a + s.annualCost, 0) * 0.35,
  );

  return [
    {
      title: `Optimize ${top?.name ?? "discretionary"} spending by 10%`,
      detail: `Targeting a modest 10% reduction in your top category (${top?.name ?? "expenses"}) yields substantial annual savings.`,
      yearlySavings: Math.round(monthlyTop * 0.1 * 12),
    },
    {
      title: "Prune redundant subscriptions",
      detail:
        "Audit multi-service streaming, premium tiers, or neglected SaaS memberships before renewal.",
      yearlySavings: subSavings,
    },
    {
      title: "Payment method rewards optimization",
      detail:
        "Routing recurring fuel, grocery, and utility payments via category-cashback cards yields ~1.8% return.",
      yearlySavings: Math.round(monthlyExpenses * 0.018 * 12),
    },
  ];
}

function determinePersonality(
  savingsRate: number,
  categories: { name: string; amount: number; percent: number }[],
): InsightReport["lifestyle"]["personality"] {
  const investCategory = categories.find((c) => c.name === "Investments");
  const luxuryPercent = categories
    .filter((c) =>
      ["Shopping", "Travel", "Entertainment", "Food", "Food & Dining"].includes(
        c.name,
      ),
    )
    .reduce((acc, c) => acc + c.percent, 0);

  if (investCategory && investCategory.percent > 15) return "Investor";
  if (savingsRate >= 30) return "Saver";
  if (luxuryPercent > 45) return "Luxury spender";
  if (savingsRate < 5) return "Impulsive";
  return "Balanced";
}

function personalitySummary(
  personality: InsightReport["lifestyle"]["personality"],
): string {
  switch (personality) {
    case "Saver":
      return "Disciplined capital preservation profile. Highly resilient cash cushions with capacity for compounding growth.";
    case "Investor":
      return "Proactive wealth accumulation mindset. Systematic capital deployment into market and growth instruments.";
    case "Balanced":
      return "Prudent equilibrium between lifestyle comfort, essential commitments, and consistent monthly savings.";
    case "Luxury spender":
      return "Discretionary and experiential lifestyle bias. High living standard with opportunity to tighten secondary leaks.";
    case "Impulsive":
      return "High outflow volatility and compressed savings cushion. Implementing automated salary sweeps is recommended.";
  }
}
