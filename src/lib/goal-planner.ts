import { type FinancialGoal, type SimulationResult } from "./schemas";

export function projectGoal(goal: FinancialGoal): FinancialGoal {
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  const months =
    remaining === 0
      ? 0
      : goal.monthlyContribution > 0
        ? Math.ceil(remaining / goal.monthlyContribution)
        : Infinity;
  const projectedCompletionDate = computeProjectedDate(months);
  return {
    ...goal,
    projectedCompletionDate,
    onTrack:
      remaining === 0 ||
      (Number.isFinite(months) &&
        months <= 1200 &&
        projectedCompletionDate <= goal.deadline),
  };
}

export function generateDefaultGoals(
  monthlyIncome: number,
  monthlyExpenses: number,
  netSavings: number,
  liquidBalance = 0,
): FinancialGoal[] {
  const currentYear = new Date().getFullYear();

  // 1. Emergency Fund (3-6 months expenses)
  const availableSavings = Math.max(0, netSavings);
  const emergencyTarget = Math.max(1, Math.round(monthlyExpenses * 6));
  const emergencyCurrent = Math.min(
    emergencyTarget,
    Math.max(0, liquidBalance),
  );
  const emergencyMonthly = Math.round(availableSavings * 0.4);
  const emergencyMonthsNeeded =
    emergencyTarget <= emergencyCurrent
      ? 0
      : emergencyMonthly > 0
        ? Math.ceil((emergencyTarget - emergencyCurrent) / emergencyMonthly)
        : Infinity;
  const emergencyDeadline = `${currentYear + 1}-12-31`;

  // 2. Wealth Building / Long Term
  const wealthTarget = Math.max(
    1000000,
    Math.round(Math.max(0, monthlyIncome) * 12),
  );
  const wealthCurrent = 0;
  const wealthMonthly = Math.round(availableSavings * 0.5);
  const wealthDeadline = `${currentYear + 3}-06-30`;

  // 3. Travel / Lifestyle Goal
  const travelTarget = 150000;
  const travelCurrent = 0;
  const travelMonthly = Math.max(
    0,
    Math.round(availableSavings) - emergencyMonthly - wealthMonthly,
  );
  const travelDeadline = `${currentYear + 1}-08-15`;

  return [
    {
      id: "goal_emergency",
      title: "6-Month Emergency Buffer",
      category: "emergency_fund",
      targetAmount: emergencyTarget,
      currentAmount: emergencyCurrent,
      deadline: emergencyDeadline,
      priority: "high",
      monthlyContribution: emergencyMonthly,
      expectedReturnRate: 0,
      projectedCompletionDate: computeProjectedDate(emergencyMonthsNeeded),
      onTrack:
        emergencyCurrent >= emergencyTarget ||
        (emergencyMonthly > 0 &&
          computeProjectedDate(emergencyMonthsNeeded) <= emergencyDeadline),
    },
    {
      id: "goal_wealth",
      title: "Long-Term Growth Portfolio",
      category: "investing",
      targetAmount: wealthTarget,
      currentAmount: wealthCurrent,
      deadline: wealthDeadline,
      priority: "medium",
      monthlyContribution: wealthMonthly,
      expectedReturnRate: 0,
      projectedCompletionDate: computeProjectedDate(
        wealthMonthly > 0
          ? Math.ceil((wealthTarget - wealthCurrent) / wealthMonthly)
          : Infinity,
      ),
      onTrack:
        wealthMonthly > 0 &&
        computeProjectedDate(Math.ceil(wealthTarget / wealthMonthly)) <=
          wealthDeadline,
    },
    {
      id: "goal_travel",
      title: "Annual Travel & Vacation",
      category: "travel",
      targetAmount: travelTarget,
      currentAmount: travelCurrent,
      deadline: travelDeadline,
      priority: "low",
      monthlyContribution: travelMonthly,
      expectedReturnRate: 0,
      projectedCompletionDate: computeProjectedDate(
        travelMonthly > 0
          ? Math.ceil((travelTarget - travelCurrent) / travelMonthly)
          : Infinity,
      ),
      onTrack:
        travelMonthly > 0 &&
        computeProjectedDate(Math.ceil(travelTarget / travelMonthly)) <=
          travelDeadline,
    },
  ];
}

function computeProjectedDate(monthsAhead: number): string {
  if (!Number.isFinite(monthsAhead) || monthsAhead > 1200)
    return "Not funded within 100 years";
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + Math.max(0, monthsAhead));
  return d.toISOString().slice(0, 10);
}

export function runSpendingSimulation(
  baselineIncome: number,
  baselineExpenses: number,
  closingBalance: number,
  userDeltas: {
    incomeDelta?: number;
    rentDelta?: number;
    foodDelta?: number;
    shoppingDelta?: number;
    travelDelta?: number;
    subscriptionDelta?: number;
    emiDelta?: number;
    unexpectedExpense?: number;
  } = {},
): SimulationResult[] {
  // Current Scenario
  const currentSavings = baselineIncome - baselineExpenses;
  const currentRate =
    baselineIncome > 0
      ? Math.round((currentSavings / baselineIncome) * 100)
      : 0;
  const currentRunway =
    baselineExpenses > 0
      ? Number((closingBalance / baselineExpenses).toFixed(1))
      : 0;

  // Conservative Scenario (15% discretionary trimming)
  const conservativeExpenses = Math.round(baselineExpenses * 0.88);
  const conservativeSavings = baselineIncome - conservativeExpenses;
  const conservativeRate =
    baselineIncome > 0
      ? Math.round((conservativeSavings / baselineIncome) * 100)
      : 0;
  const conservativeRunway =
    conservativeExpenses > 0
      ? Number((closingBalance / conservativeExpenses).toFixed(1))
      : 0;

  // Balanced Scenario (8% food & shopping cut + subscription optimization)
  const balancedExpenses = Math.round(baselineExpenses * 0.93);
  const balancedSavings = baselineIncome - balancedExpenses;
  const balancedRate =
    baselineIncome > 0
      ? Math.round((balancedSavings / baselineIncome) * 100)
      : 0;
  const balancedRunway =
    balancedExpenses > 0
      ? Number((closingBalance / balancedExpenses).toFixed(1))
      : 0;

  // Aggressive Growth Scenario (20% cuts + 10% income side hustle/growth)
  const aggressiveIncome = Math.round(baselineIncome * 1.1);
  const aggressiveExpenses = Math.round(baselineExpenses * 0.82);
  const aggressiveSavings = aggressiveIncome - aggressiveExpenses;
  const aggressiveRate =
    aggressiveIncome > 0
      ? Math.round((aggressiveSavings / aggressiveIncome) * 100)
      : 0;
  const aggressiveRunway =
    aggressiveExpenses > 0
      ? Number((closingBalance / aggressiveExpenses).toFixed(1))
      : 0;

  // Custom User Scenario
  const customIncome = Math.max(
    0,
    baselineIncome + (userDeltas.incomeDelta || 0),
  );
  const totalExpenseDelta =
    (userDeltas.rentDelta || 0) +
    (userDeltas.foodDelta || 0) +
    (userDeltas.shoppingDelta || 0) +
    (userDeltas.travelDelta || 0) +
    (userDeltas.subscriptionDelta || 0) +
    (userDeltas.emiDelta || 0) +
    (userDeltas.unexpectedExpense || 0);
  const customExpenses = Math.max(0, baselineExpenses + totalExpenseDelta);
  const customSavings = customIncome - customExpenses;
  const customRate =
    customIncome > 0 ? Math.round((customSavings / customIncome) * 100) : 0;
  const customRunway =
    customExpenses > 0
      ? Number((closingBalance / customExpenses).toFixed(1))
      : 0;

  return [
    {
      scenarioName: "Current Baseline",
      monthlyIncome: baselineIncome,
      monthlyExpenses: baselineExpenses,
      netSavings: currentSavings,
      savingsRate: currentRate,
      emergencyRunwayMonths: currentRunway,
      summary: `Maintains your current run-rate saving ₹${currentSavings.toLocaleString("en-IN")}/mo at a ${currentRate}% savings rate.`,
    },
    {
      scenarioName: "Balanced Optimization",
      monthlyIncome: baselineIncome,
      monthlyExpenses: balancedExpenses,
      netSavings: balancedSavings,
      savingsRate: balancedRate,
      emergencyRunwayMonths: balancedRunway,
      summary: `Trims roughly 7% from food, shopping, and unused services to boost monthly savings by ₹${(balancedSavings - currentSavings).toLocaleString("en-IN")}.`,
    },
    {
      scenarioName: "Conservative Saver",
      monthlyIncome: baselineIncome,
      monthlyExpenses: conservativeExpenses,
      netSavings: conservativeSavings,
      savingsRate: conservativeRate,
      emergencyRunwayMonths: conservativeRunway,
      summary: `Disciplined 12% discretionary reduction protecting cash reserves during economic or employment transitions.`,
    },
    {
      scenarioName: "Aggressive Growth",
      monthlyIncome: aggressiveIncome,
      monthlyExpenses: aggressiveExpenses,
      netSavings: aggressiveSavings,
      savingsRate: aggressiveRate,
      emergencyRunwayMonths: aggressiveRunway,
      summary: `Maximizes investment velocity by targeting a 10% income lift and 18% expense compression.`,
    },
    {
      scenarioName: "Custom What-If",
      monthlyIncome: customIncome,
      monthlyExpenses: customExpenses,
      netSavings: customSavings,
      savingsRate: customRate,
      emergencyRunwayMonths: customRunway,
      summary: `Simulated custom scenario reflecting your adjustments yielding ₹${customSavings.toLocaleString("en-IN")}/mo (${customRate}% savings rate).`,
    },
  ];
}
