import { z } from "zod";

export const transactionTypeSchema = z.enum(["income", "expense", "transfer"]);

export const transactionSchema = z.object({
  id: z.string().min(1),
  date: z.string().min(1),
  description: z.string().min(1),
  merchant: z.string().min(1),
  debit: z.number().finite().nonnegative().default(0),
  credit: z.number().finite().nonnegative().default(0),
  amount: z.number().finite(),
  type: transactionTypeSchema,
  category: z.string().min(1),
  subcategory: z.string().optional().default("General"),
  paymentMethod: z.string().optional().default("Bank"),
  account: z.string().optional().default("Primary"),
  reference: z.string().optional().default(""),
  runningBalance: z.number().finite().optional(),
  importSource: z.string().optional().default("manual"),
  confidence: z.number().min(0).max(1).default(1),
  isReviewed: z.boolean().default(false),
  isExcluded: z.boolean().default(false),
  notes: z.string().optional().default(""),
});

export const subscriptionCadenceSchema = z.enum(["weekly", "biweekly", "monthly", "quarterly", "annual"]);

export const subscriptionSchema = z.object({
  id: z.string().min(1),
  merchant: z.string().min(1),
  amount: z.number().finite().nonnegative(),
  frequency: subscriptionCadenceSchema,
  confidence: z.number().min(0).max(1),
  lastPaymentDate: z.string().min(1),
  nextPaymentDate: z.string().min(1),
  annualCost: z.number().finite().nonnegative(),
  monthlyCost: z.number().finite().nonnegative(),
  recommendation: z.string().min(1),
  explanation: z.string().optional().default(""),
  isConfirmed: z.boolean().default(false),
});

export const healthFactorBreakdownSchema = z.object({
  factor: z.string().min(1),
  score: z.number().finite().min(0).max(100),
  weight: z.number().finite().min(0).max(1),
  value: z.string().min(1),
  impact: z.enum(["positive", "neutral", "negative"]),
  description: z.string().min(1),
});

export const healthScoreSchema = z.object({
  score: z.number().finite().min(0).max(100),
  label: z.string().min(1),
  breakdown: z.array(healthFactorBreakdownSchema),
  methodology: z.string().min(1),
  period: z.string().min(1),
  recommendations: z.array(z.string()),
});

export const categorySchema = z.object({
  name: z.string().min(1),
  amount: z.number().finite().nonnegative(),
  percent: z.number().finite(),
  transactionCount: z.number().int().nonnegative().default(0),
});

export const goalCategorySchema = z.enum([
  "emergency_fund",
  "travel",
  "vehicle",
  "education",
  "home",
  "debt_payoff",
  "investing",
  "custom",
]);

export const financialGoalSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: goalCategorySchema,
  targetAmount: z.number().finite().positive(),
  currentAmount: z.number().finite().nonnegative(),
  deadline: z.string().min(1),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  monthlyContribution: z.number().finite().nonnegative(),
  expectedReturnRate: z.number().finite().nonnegative().default(0),
  projectedCompletionDate: z.string().min(1),
  onTrack: z.boolean().default(true),
});

export const scenarioAdjustmentSchema = z.object({
  incomeDelta: z.number().finite().default(0),
  rentDelta: z.number().finite().default(0),
  foodDelta: z.number().finite().default(0),
  shoppingDelta: z.number().finite().default(0),
  travelDelta: z.number().finite().default(0),
  subscriptionDelta: z.number().finite().default(0),
  emiDelta: z.number().finite().default(0),
  unexpectedExpense: z.number().finite().default(0),
});

export const simulationResultSchema = z.object({
  scenarioName: z.string().min(1),
  monthlyIncome: z.number().finite(),
  monthlyExpenses: z.number().finite(),
  netSavings: z.number().finite(),
  savingsRate: z.number().finite(),
  emergencyRunwayMonths: z.number().finite(),
  summary: z.string().min(1),
});

export const balanceSummarySchema = z.object({
  amount: z.number().finite(),
  source: z.enum(["observed", "calculated", "estimated", "predicted"]),
  confidence: z.number().min(0).max(1).default(1),
  note: z.string().optional().default(""),
});

export const forecastingSchema = z.object({
  nextMonthExpenses: z.number().finite(),
  nextMonthIncome: z.number().finite(),
  nextMonthSavings: z.number().finite(),
  futureBalance90Days: z.number().finite(),
  goalProbability: z.number().finite(),
  modelType: z.enum(["baseline_projection", "exponential_smoothing", "moving_average", "seasonal_trend"]),
  confidenceInterval: z.object({
    lower: z.number().finite(),
    upper: z.number().finite(),
  }),
  evaluationMetrics: z.object({
    mae: z.number().finite(),
    rmse: z.number().finite(),
    mape: z.number().finite(),
  }),
  categoryForecasts: z.array(z.object({
    name: z.string().min(1),
    projectedAmount: z.number().finite().nonnegative(),
    trend: z.enum(["up", "down", "flat"]),
  })),
  explanation: z.string().min(1),
});

export const insightReportSchema = z.object({
  generatedAt: z.string().min(1),
  period: z.object({
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    totalDays: z.number().int().nonnegative(),
  }),
  balances: z.object({
    opening: balanceSummarySchema,
    closing: balanceSummarySchema,
    calculatedClosing: balanceSummarySchema,
  }),
  totals: z.object({
    income: z.number().finite(),
    expenses: z.number().finite(),
    transfers: z.number().finite().default(0),
    netSavings: z.number().finite(),
    savingsRate: z.number().finite(),
    averageDailySpend: z.number().finite(),
    totalTransactions: z.number().int().nonnegative(),
    averageTransactionValue: z.number().finite(),
  }),
  health: healthScoreSchema,
  lifestyle: z.object({
    personality: z.enum(["Saver", "Balanced", "Impulsive", "Luxury spender", "Investor"]),
    summary: z.string().min(1),
  }),
  categories: z.array(categorySchema),
  dailyTrend: z.array(z.object({ date: z.string().min(1), amount: z.number().finite().nonnegative() })),
  weeklyTrend: z.array(z.object({ week: z.string().min(1), amount: z.number().finite().nonnegative() })),
  merchants: z.array(z.object({
    merchant: z.string().min(1),
    amount: z.number().finite().nonnegative(),
    transactions: z.number().int().nonnegative(),
  })),
  subscriptions: z.array(subscriptionSchema),
  opportunities: z.array(z.object({
    title: z.string().min(1),
    detail: z.string().min(1),
    yearlySavings: z.number().finite().nonnegative(),
  })),
  alerts: z.array(z.object({
    severity: z.enum(["low", "medium", "high"]),
    title: z.string().min(1),
    detail: z.string().min(1),
  })),
  bills: z.array(z.object({
    merchant: z.string().min(1),
    amount: z.number().finite().nonnegative(),
    predictedDate: z.string().min(1),
  })),
  forecasting: forecastingSchema,
  weekendVsWeekday: z.object({
    weekend: z.number().finite().nonnegative(),
    weekday: z.number().finite().nonnegative(),
  }),
  salary: z.object({
    detected: z.boolean(),
    merchant: z.string(),
    amount: z.number().finite(),
    cadence: z.string(),
    trend: z.string(),
  }),
  goals: z.array(financialGoalSchema).default([]),
  simulationScenarios: z.array(simulationResultSchema).default([]),
  coachTips: z.array(z.string()),
  transactions: z.array(transactionSchema).max(10000),
  importSummary: z.object({
    totalParsed: z.number().int().nonnegative(),
    duplicatesRemoved: z.number().int().nonnegative(),
    transfersIdentified: z.number().int().nonnegative(),
    fileNames: z.array(z.string()),
  }).optional(),
});

export const chatRequestSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  report: insightReportSchema,
  allowAiSharing: z.boolean().default(false),
});

export const exportRequestSchema = z.object({
  report: insightReportSchema,
  format: z.enum(["csv", "xlsx", "pdf", "json"]),
  filters: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    category: z.string().optional(),
  }).optional(),
});

export type Transaction = z.infer<typeof transactionSchema>;
export type Subscription = z.infer<typeof subscriptionSchema>;
export type InsightReport = z.infer<typeof insightReportSchema>;
export type FinancialGoal = z.infer<typeof financialGoalSchema>;
export type SimulationResult = z.infer<typeof simulationResultSchema>;
export type HealthScore = z.infer<typeof healthScoreSchema>;
export type Forecasting = z.infer<typeof forecastingSchema>;
