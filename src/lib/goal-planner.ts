import { type FinancialGoal, type SimulationResult } from "./schemas";

export function generateDefaultGoals(monthlyIncome: number, monthlyExpenses: number, netSavings: number): FinancialGoal[] {
  const currentYear = new Date().getFullYear();

  // 1. Emergency Fund (3-6 months expenses)
  const emergencyTarget = Math.round(monthlyExpenses * 6);
  const emergencyCurrent = Math.round(monthlyExpenses * 1.5);
  const emergencyMonthly = Math.round(Math.max(5000, netSavings * 0.4));
  const emergencyMonthsNeeded = Math.ceil(Math.max(0, emergencyTarget - emergencyCurrent) / (emergencyMonthly || 1));
  const emergencyDeadline = `${currentYear + 1}-12-31`;

  // 2. Wealth Building / Long Term
  const wealthTarget = 1000000;
  const wealthCurrent = Math.round(monthlyIncome * 2);
  const wealthMonthly = Math.round(Math.max(10000, netSavings * 0.5));
  const wealthDeadline = `${currentYear + 3}-06-30`;

  // 3. Travel / Lifestyle Goal
  const travelTarget = 150000;
  const travelCurrent = 25000;
  const travelMonthly = Math.round(Math.max(3000, netSavings * 0.1));
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
      expectedReturnRate: 6.5,
      projectedCompletionDate: computeProjectedDate(emergencyMonthsNeeded),
      onTrack: netSavings >= emergencyMonthly,
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
      expectedReturnRate: 11.5,
      projectedCompletionDate: computeProjectedDate(Math.ceil((wealthTarget - wealthCurrent) / (wealthMonthly || 1))),
      onTrack: netSavings >= wealthMonthly,
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
      expectedReturnRate: 5.0,
      projectedCompletionDate: computeProjectedDate(Math.ceil((travelTarget - travelCurrent) / (travelMonthly || 1))),
      onTrack: true,
    },
  ];
}

function computeProjectedDate(monthsAhead: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + Math.max(1, monthsAhead));
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
  const currentRate = baselineIncome > 0 ? Math.round((currentSavings / baselineIncome) * 100) : 0;
  const currentRunway = baselineExpenses > 0 ? Number((closingBalance / baselineExpenses).toFixed(1)) : 0;

  // Conservative Scenario (15% discretionary trimming)
  const conservativeExpenses = Math.round(baselineExpenses * 0.88);
  const conservativeSavings = baselineIncome - conservativeExpenses;
  const conservativeRate = baselineIncome > 0 ? Math.round((conservativeSavings / baselineIncome) * 100) : 0;
  const conservativeRunway = conservativeExpenses > 0 ? Number((closingBalance / conservativeExpenses).toFixed(1)) : 0;

  // Balanced Scenario (8% food & shopping cut + subscription optimization)
  const balancedExpenses = Math.round(baselineExpenses * 0.93);
  const balancedSavings = baselineIncome - balancedExpenses;
  const balancedRate = baselineIncome > 0 ? Math.round((balancedSavings / baselineIncome) * 100) : 0;
  const balancedRunway = balancedExpenses > 0 ? Number((closingBalance / balancedExpenses).toFixed(1)) : 0;

  // Aggressive Growth Scenario (20% cuts + 10% income side hustle/growth)
  const aggressiveIncome = Math.round(baselineIncome * 1.10);
  const aggressiveExpenses = Math.round(baselineExpenses * 0.82);
  const aggressiveSavings = aggressiveIncome - aggressiveExpenses;
  const aggressiveRate = aggressiveIncome > 0 ? Math.round((aggressiveSavings / aggressiveIncome) * 100) : 0;
  const aggressiveRunway = aggressiveExpenses > 0 ? Number((closingBalance / aggressiveExpenses).toFixed(1)) : 0;

  // Custom User Scenario
  const customIncome = baselineIncome + (userDeltas.incomeDelta || 0);
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
  const customRate = customIncome > 0 ? Math.round((customSavings / customIncome) * 100) : 0;
  const customRunway = customExpenses > 0 ? Number((closingBalance / customExpenses).toFixed(1)) : 0;

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
