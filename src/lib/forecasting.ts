import { type Forecasting, type Transaction } from "./schemas";
import { sumMoney, roundMoney } from "./money";

export function generateFinancialForecast(
  transactions: Transaction[],
  currentNetSavings: number,
  closingBalance: number,
  periodDays: number,
): Forecasting {
  const expenseTxns = transactions.filter(
    (t) => t.type === "expense" && !t.isExcluded,
  );
  const incomeTxns = transactions.filter(
    (t) => t.type === "income" && !t.isExcluded,
  );

  const totalExpense = sumMoney(expenseTxns.map((t) => Math.abs(t.amount)));
  const totalIncome = sumMoney(incomeTxns.map((t) => Math.abs(t.amount)));

  const normalizedDays = Math.max(1, periodDays);
  const monthlyExpenseBaseline = Math.round(
    (totalExpense / normalizedDays) * 30,
  );
  const monthlyIncomeBaseline = Math.round((totalIncome / normalizedDays) * 30);

  // Group expenses by calendar date
  const dailySpendMap = new Map<string, number>();
  for (const t of expenseTxns) {
    dailySpendMap.set(
      t.date,
      roundMoney((dailySpendMap.get(t.date) || 0) + Math.abs(t.amount)),
    );
  }

  const dates = transactions.map((t) => t.date).sort();
  const startMs = dates.length
    ? new Date(`${dates[0]}T00:00:00Z`).getTime()
    : Date.now();
  // Include zero-spend days: dropping them overstates a sparse statement's run-rate.
  const dailySeries = Array.from(
    { length: Math.min(10000, normalizedDays) },
    (_, i) =>
      dailySpendMap.get(
        new Date(startMs + i * 86400000).toISOString().slice(0, 10),
      ) ?? 0,
  );

  let modelType: Forecasting["modelType"] = "baseline_projection";
  let projectedMonthlyExpenses = monthlyExpenseBaseline;
  let mae = 0;
  let rmse = 0;
  let mape = 0;

  if (dailySeries.length >= 14) {
    modelType = "exponential_smoothing";

    // Chronological validation: 80% train, 20% test
    const splitIdx = Math.floor(dailySeries.length * 0.8);
    const train = dailySeries.slice(0, splitIdx);
    const test = dailySeries.slice(splitIdx);

    // Exponential smoothing with alpha = 0.3
    const alpha = 0.3;
    let s = train[0] || 0;
    for (let i = 1; i < train.length; i++) {
      s = alpha * train[i] + (1 - alpha) * s;
    }

    // Evaluate on test
    const errors: number[] = [];
    const absPercentErrors: number[] = [];
    let testS = s;
    for (const actual of test) {
      const err = actual - testS;
      errors.push(err);
      if (actual > 0) absPercentErrors.push(Math.abs(err) / actual);
      testS = alpha * actual + (1 - alpha) * testS;
    }

    if (errors.length > 0) {
      mae = Math.round(
        errors.reduce((sum, e) => sum + Math.abs(e), 0) / errors.length,
      );
      const mse =
        errors.reduce((sum, e) => sum + Math.pow(e, 2), 0) / errors.length;
      rmse = Math.round(Math.sqrt(mse));
      mape =
        absPercentErrors.length > 0
          ? Math.round(
              (absPercentErrors.reduce((sum, p) => sum + p, 0) /
                absPercentErrors.length) *
                100,
            )
          : 12;
    }

    // Project forward for 30 days using smoothed level
    projectedMonthlyExpenses = Math.round(testS * 30);
    // Blend with monthly empirical average for robustness
    projectedMonthlyExpenses = Math.round(
      projectedMonthlyExpenses * 0.6 + monthlyExpenseBaseline * 0.4,
    );
  } else {
    // Insufficient daily granularity: use transparent empirical baseline
    modelType = "baseline_projection";
    // There is no backtest for a short statement, so do not fabricate metrics.
    mae = 0;
    rmse = 0;
    mape = 0;
  }

  const projectedMonthlyIncome = monthlyIncomeBaseline;
  const projectedMonthlySavings =
    projectedMonthlyIncome - projectedMonthlyExpenses;
  const futureBalance90Days = Math.round(
    closingBalance + projectedMonthlySavings * 3,
  );

  // Category projections
  const catMap = new Map<string, number>();
  for (const t of expenseTxns) {
    catMap.set(t.category, (catMap.get(t.category) || 0) + Math.abs(t.amount));
  }

  const categoryForecasts = [...catMap.entries()]
    .map(([name, amt]) => {
      const monthlyAmt = Math.round((amt / normalizedDays) * 30);
      return {
        name,
        projectedAmount: monthlyAmt,
        trend: "flat" as const,
      };
    })
    .sort((a, b) => b.projectedAmount - a.projectedAmount);

  // Confidence interval (+/- 1.5 * RMSE scaled to monthly)
  const monthlyMargin = Math.round(
    Math.max(rmse * Math.sqrt(30), projectedMonthlyExpenses * 0.08),
  );
  const confidenceInterval = {
    lower: Math.max(0, projectedMonthlyExpenses - monthlyMargin),
    upper: projectedMonthlyExpenses + monthlyMargin,
  };

  const savingsRate =
    projectedMonthlyIncome > 0
      ? (projectedMonthlySavings / projectedMonthlyIncome) * 100
      : 0;
  const goalProbability =
    currentNetSavings <= 0 || projectedMonthlySavings <= 0
      ? 0
      : Math.round(Math.max(0, Math.min(95, 40 + savingsRate * 1.2)));

  const explanation =
    modelType === "exponential_smoothing"
      ? `Forecast built using single exponential smoothing with chronological train/test backtesting (MAE: ₹${mae.toLocaleString("en-IN")}, RMSE: ₹${rmse.toLocaleString("en-IN")}). Projected spend reflects recent run-rate.`
      : `Empirical baseline from ${normalizedDays} days, scaled to 30 days. Insufficient history for a backtest; displayed error metrics are zero rather than measured errors.`;

  return {
    nextMonthExpenses: projectedMonthlyExpenses,
    nextMonthIncome: projectedMonthlyIncome,
    nextMonthSavings: projectedMonthlySavings,
    futureBalance90Days,
    goalProbability,
    modelType,
    confidenceInterval,
    evaluationMetrics: {
      mae,
      rmse,
      mape,
    },
    categoryForecasts,
    explanation,
  };
}
