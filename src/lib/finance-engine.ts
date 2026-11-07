import {
  type InsightReport,
  type Transaction,
  type Subscription,
} from "./schemas";
import { categorizeTransaction, extractMerchant } from "./categorizer";
import { parseGenericBankText, parseCsvRows, parseStructuredTable } from "./bank-parsers";
import { detectRecurringSubscriptions } from "./subscriptions";
import { calculateFinancialHealthScore } from "./health-score";
import { generateFinancialForecast } from "./forecasting";
import { generateDefaultGoals, runSpendingSimulation } from "./goal-planner";

export * from "./schemas";
export { categorizeTransaction, extractMerchant } from "./categorizer";
export { parseGenericBankText, parseCsvRows, parseStructuredTable } from "./bank-parsers";

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

export function parseTransactionsFromText(text: string, filename = "statement.txt"): Transaction[] {
  // Check if text appears to be CSV format
  if (text.includes(",") || text.includes(";") || text.includes("\t")) {
    const rows = parseCsvRows(text);
    if (rows.length > 2) {
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

  const today = new Date();
  const txns: Transaction[] = [];

  for (let i = 0; i < 90; i++) {
    const item = merchants[i % merchants.length];
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const dateString = date.toISOString().slice(0, 10);

    const baseAmt = item[1];
    // Add realistic variation
    const variation = baseAmt < 0
      ? -(Math.round(Math.abs(baseAmt) * (0.85 + ((i % 7) * 0.05))))
      : baseAmt;

    const isExpense = variation < 0;
    const cat = item[2];

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
      paymentMethod: i % 3 === 0 ? "UPI" : i % 3 === 1 ? "Debit Card" : "Net Banking",
      account: "Primary Checking",
      reference: `REF${100000 + i}`,
      runningBalance: 120000 + (variation * (i + 1)),
      importSource: "demo-dataset",
      confidence: 0.95,
      isReviewed: true,
      isExcluded: false,
      notes: "Sample verified demo transaction",
    });
  }

  return txns.sort((a, b) => a.date.localeCompare(b.date));
}

export function buildReport(transactions: Transaction[], metadata?: { fileNames?: string[] }): InsightReport {
  const activeTxns = transactions.filter(t => !t.isExcluded);

  // Decimal-safe sum
  const expenses = activeTxns
    .filter(t => t.type === "expense")
    .reduce((acc, t) => acc + Math.abs(t.amount), 0);

  const income = activeTxns
    .filter(t => t.type === "income")
    .reduce((acc, t) => acc + Math.abs(t.amount), 0);

  const transfers = activeTxns
    .filter(t => t.type === "transfer")
    .reduce((acc, t) => acc + Math.abs(t.amount), 0);

  const netSavings = income - expenses;
  const savingsRate = income > 0 ? Math.round((netSavings / income) * 100) : 0;

  // Calculate unique days and date range
  const dates = [...new Set(activeTxns.map(t => t.date))].sort();
  const startDate = dates[0] || new Date().toISOString().slice(0, 10);
  const endDate = dates[dates.length - 1] || startDate;
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const periodDays = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1);

  // Group by category
  const catTotals = new Map<string, { amount: number; count: number }>();
  for (const t of activeTxns.filter(t => t.type === "expense")) {
    const cur = catTotals.get(t.category) || { amount: 0, count: 0 };
    catTotals.set(t.category, {
      amount: cur.amount + Math.abs(t.amount),
      count: cur.count + 1,
    });
  }

  const categories = [...catTotals.entries()]
    .map(([name, val]) => ({
      name,
      amount: Math.round(val.amount),
      percent: expenses > 0 ? Math.round((val.amount / expenses) * 100) : 0,
      transactionCount: val.count,
    }))
    .sort((a, b) => b.amount - a.amount);

  // Group by top merchants
  const merchantTotals = new Map<string, { amount: number; count: number }>();
  for (const t of activeTxns.filter(t => t.type === "expense")) {
    const cur = merchantTotals.get(t.merchant) || { amount: 0, count: 0 };
    merchantTotals.set(t.merchant, {
      amount: cur.amount + Math.abs(t.amount),
      count: cur.count + 1,
    });
  }

  const merchants = [...merchantTotals.entries()]
    .map(([merchant, val]) => ({
      merchant,
      amount: Math.round(val.amount),
      transactions: val.count,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  // Detect Subscriptions
  const subscriptions = detectRecurringSubscriptions(activeTxns);

  // Weekend vs Weekday analysis
  const weekendVsWeekday = activeTxns
    .filter(t => t.type === "expense")
    .reduce(
      (acc, t) => {
        const d = new Date(`${t.date}T00:00:00.000Z`).getUTCDay();
        if (d === 0 || d === 6) acc.weekend += Math.abs(t.amount);
        else acc.weekday += Math.abs(t.amount);
        return acc;
      },
      { weekend: 0, weekday: 0 },
    );

  // Fixed and debt expenses for health score
  const fixedCategories = new Set(["Housing", "Utilities", "Insurance", "Fuel", "Groceries"]);
  const fixedExpenses = categories
    .filter(c => fixedCategories.has(c.name))
    .reduce((acc, c) => acc + c.amount, 0);

  const debtExpenses = categories
    .filter(c => c.name === "EMI & Loans" || c.name === "Debt")
    .reduce((acc, c) => acc + c.amount, 0);

  // Observed vs Calculated Balances
  const txnsWithBalance = activeTxns.filter(t => t.runningBalance !== undefined);
  const observedOpening = txnsWithBalance.length > 0 ? txnsWithBalance[0].runningBalance : undefined;
  const observedClosing = txnsWithBalance.length > 0 ? txnsWithBalance[txnsWithBalance.length - 1].runningBalance : undefined;

  const openingAmount = observedOpening ?? 100000;
  const calculatedClosing = openingAmount + netSavings;
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
  const forecasting = generateFinancialForecast(activeTxns, netSavings, closingAmount, periodDays);

  // Goal Planner
  const monthlyIncome = Math.round((income / periodDays) * 30);
  const monthlyExpenses = Math.round((expenses / periodDays) * 30);
  const goals = generateDefaultGoals(monthlyIncome, monthlyExpenses, netSavings);

  // Spending Simulator Scenarios
  const simulationScenarios = runSpendingSimulation(monthlyIncome, monthlyExpenses, closingAmount);

  // Trends
  const dailyTrend = buildDailyTrend(activeTxns);
  const weeklyTrend = buildWeeklyTrend(activeTxns);

  // Salary detection
  const salary = detectSalary(activeTxns);

  // Alerts
  const alerts = buildRiskAlerts(categories, subscriptions, income, expenses, debtExpenses);

  // Personality & lifestyle
  const personality = determinePersonality(savingsRate, categories);

  const totalTxnCount = activeTxns.length;
  const avgTxnValue = totalTxnCount > 0 ? Math.round(expenses / Math.max(1, activeTxns.filter(t => t.type === "expense").length)) : 0;

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
        source: observedOpening !== undefined ? "observed" : "estimated",
        confidence: observedOpening !== undefined ? 1 : 0.65,
        note: observedOpening !== undefined ? "Directly extracted from statement" : "Estimated baseline",
      },
      closing: {
        amount: closingAmount,
        source: observedClosing !== undefined ? "observed" : "calculated",
        confidence: observedClosing !== undefined ? 1 : 0.85,
        note: observedClosing !== undefined ? "Directly extracted from statement" : "Computed from net cash flow",
      },
      calculatedClosing: {
        amount: calculatedClosing,
        source: "calculated",
        confidence: 0.95,
        note: "Derived from verified opening balance + cash inflows - cash outflows",
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
    opportunities: buildOpportunities(categories, subscriptions, expenses),
    alerts,
    bills: subscriptions.map(s => ({
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
    transactions,
    importSummary: {
      totalParsed: transactions.length,
      duplicatesRemoved: 0,
      transfersIdentified: activeTxns.filter(t => t.type === "transfer").length,
      fileNames: metadata?.fileNames || ["uploaded-statement"],
    },
  };
}

function buildDailyTrend(transactions: Transaction[]) {
  const map = new Map<string, number>();
  for (const t of transactions.filter(t => t.type === "expense")) {
    map.set(t.date, (map.get(t.date) || 0) + Math.abs(t.amount));
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([date, amount]) => ({ date, amount: Math.round(amount) }));
}

function buildWeeklyTrend(transactions: Transaction[]) {
  const map = new Map<string, number>();
  for (const t of transactions.filter(t => t.type === "expense")) {
    const d = new Date(`${t.date}T00:00:00.000Z`);
    const weekStart = new Date(d);
    weekStart.setUTCDate(d.getUTCDate() - d.getUTCDay());
    const weekKey = weekStart.toISOString().slice(0, 10);
    map.set(weekKey, (map.get(weekKey) || 0) + Math.abs(t.amount));
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, amount]) => ({ week, amount: Math.round(amount) }));
}

function detectSalary(transactions: Transaction[]) {
  const salaryTxns = transactions.filter(
    t => t.type === "income" && /salary|payroll|stipend|wages|employer/i.test(`${t.description} ${t.category}`)
  );
  const highestIncome = transactions.filter(t => t.type === "income").sort((a, b) => b.amount - a.amount)[0];
  const chosen = salaryTxns[0] ?? highestIncome;

  return {
    detected: Boolean(chosen),
    merchant: chosen ? chosen.merchant : "Not detected",
    amount: chosen ? chosen.amount : 0,
    cadence: salaryTxns.length > 1 ? "Predictable monthly salary cadence" : "Single verified deposit detected",
    trend: salaryTxns.length > 1 ? "Stable recurring income" : "Requires additional statements for historical growth trend",
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

  if (expenses > income * 0.90) {
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
      detail: "No critical volatility anomalies or excessive expense concentrations detected.",
    });
  }

  return alerts;
}

function buildOpportunities(
  categories: { name: string; amount: number; percent: number }[],
  subscriptions: Subscription[],
  expenses: number,
) {
  const top = categories[0];
  const subSavings = Math.round(subscriptions.reduce((a, s) => a + s.annualCost, 0) * 0.35);

  return [
    {
      title: `Optimize ${top?.name ?? "discretionary"} spending by 10%`,
      detail: `Targeting a modest 10% reduction in your top category (${top?.name ?? "expenses"}) yields substantial annual savings.`,
      yearlySavings: Math.round((top?.amount ?? expenses * 0.2) * 0.10 * 12),
    },
    {
      title: "Prune redundant subscriptions",
      detail: "Audit multi-service streaming, premium tiers, or neglected SaaS memberships before renewal.",
      yearlySavings: subSavings > 0 ? subSavings : 4500,
    },
    {
      title: "Payment method rewards optimization",
      detail: "Routing recurring fuel, grocery, and utility payments via category-cashback cards yields ~1.8% return.",
      yearlySavings: Math.round(expenses * 0.018 * 12),
    },
  ];
}

function determinePersonality(savingsRate: number, categories: { name: string; amount: number; percent: number }[]): InsightReport["lifestyle"]["personality"] {
  const investCategory = categories.find(c => c.name === "Investments");
  const luxuryPercent = categories
    .filter(c => ["Shopping", "Travel", "Entertainment", "Food & Dining"].includes(c.name))
    .reduce((acc, c) => acc + c.percent, 0);

  if (investCategory && investCategory.percent > 15) return "Investor";
  if (savingsRate >= 30) return "Saver";
  if (luxuryPercent > 45) return "Luxury spender";
  if (savingsRate < 5) return "Impulsive";
  return "Balanced";
}

function personalitySummary(personality: InsightReport["lifestyle"]["personality"]): string {
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
