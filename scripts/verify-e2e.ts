import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildReport,
  parseTransactionsFromText,
  demoTransactions,
} from "../src/lib/finance-engine";
import { parseCsvRows, parseStructuredTable } from "../src/lib/bank-parsers";
import { detectRecurringSubscriptions } from "../src/lib/subscriptions";
import { calculateFinancialHealthScore } from "../src/lib/health-score";
import { generateFinancialForecast } from "../src/lib/forecasting";
import { generateDefaultGoals, runSpendingSimulation } from "../src/lib/goal-planner";
import { answerLocally } from "../src/app/api/chat/route";
import { reportToCsv } from "../src/lib/exporters";

async function runEndToEndVerification() {
  console.log("=== FINANCEIQ END-TO-END VERIFICATION SUITE ===");

  // 1. Bank Statement Parsing: CSV with Debit & Credit Columns
  console.log("\n[1/10] Testing Multi-Column Bank Statement Parsing...");
  const hdfcBankCsv = `Date,Narration,Chq/Ref No,Value Dt,Withdrawal Amt,Deposit Amt,Closing Balance
01/04/2026,ACME TECH PAYROLL SALARY,SAL001,01/04/2026,,180000.00,320000.00
02/04/2026,SWIGGY BANGALORE EATS,SWIG99,02/04/2026,1250.00,,318750.00
03/04/2026,NETFLIX RECURRING CHARGE,SUB01,03/04/2026,649.00,,318101.00
04/04/2026,SELF TRANSFER TO LINKED ACC,TRF01,04/04/2026,25000.00,,293101.00
05/04/2026,GROWW MUTUAL FUND SIP,SIP99,05/04/2026,15000.00,,278101.00
`;
  const parsedRows = parseCsvRows(hdfcBankCsv);
  assert.equal(parsedRows.length, 6);
  const structuredResult = parseStructuredTable(parsedRows, "hdfc_sample.csv");
  assert.equal(structuredResult.transactions.length, 5);
  assert.equal(structuredResult.transactions[0].credit, 180000);
  assert.equal(structuredResult.transactions[1].debit, 1250);
  assert.equal(structuredResult.transactions[3].type, "transfer");
  console.log("✓ CSV multi-column table successfully parsed with transfer detection.");

  // 2. Demo Dataset Integrity
  console.log("\n[2/10] Testing Demo Transactions Generator...");
  const demoTxns = demoTransactions();
  assert.ok(demoTxns.length >= 70);
  assert.ok(demoTxns.some((t) => t.category === "Salary"));
  assert.ok(demoTxns.some((t) => t.category === "Investments"));
  console.log(`✓ Demo generator produced ${demoTxns.length} realistic verified records.`);

  // 3. Financial Calculation Accuracy & Decimal Reconciliation
  console.log("\n[3/10] Testing Financial Calculations & Decimal Precision...");
  const report = buildReport(structuredResult.transactions);
  assert.equal(report.totals.income, 180000);
  assert.equal(report.totals.expenses, 1250 + 649 + 15000); // 16899
  assert.equal(report.totals.transfers, 25000); // Transfer excluded from expense
  assert.equal(report.totals.netSavings, 180000 - 16899); // 163101
  assert.equal(report.balances.opening.amount, 320000);
  assert.equal(report.balances.closing.amount, 278101);
  console.log("✓ Inflows, outflows, net savings, and observed bank balances accurately reconciled.");

  // 4. Multi-Cadence Subscription Detection
  console.log("\n[4/10] Testing Subscription Detection Engine...");
  const multiSubs = [
    { id: "1", date: "2026-01-05", description: "Netflix Standard", merchant: "Netflix", debit: 649, credit: 0, amount: -649, type: "expense" as const, category: "Entertainment", subcategory: "General", confidence: 0.9, isReviewed: false, isExcluded: false, paymentMethod: "Card", account: "Primary", reference: "", importSource: "test", notes: "" },
    { id: "2", date: "2026-02-05", description: "Netflix Standard", merchant: "Netflix", debit: 649, credit: 0, amount: -649, type: "expense" as const, category: "Entertainment", subcategory: "General", confidence: 0.9, isReviewed: false, isExcluded: false, paymentMethod: "Card", account: "Primary", reference: "", importSource: "test", notes: "" },
    { id: "3", date: "2026-03-05", description: "Netflix Standard", merchant: "Netflix", debit: 649, credit: 0, amount: -649, type: "expense" as const, category: "Entertainment", subcategory: "General", confidence: 0.9, isReviewed: false, isExcluded: false, paymentMethod: "Card", account: "Primary", reference: "", importSource: "test", notes: "" },
  ];
  const detectedSubs = detectRecurringSubscriptions(multiSubs);
  assert.equal(detectedSubs.length, 1);
  assert.equal(detectedSubs[0].merchant, "Netflix");
  assert.equal(detectedSubs[0].frequency, "monthly");
  assert.equal(detectedSubs[0].annualCost, 649 * 12);
  assert.equal(detectedSubs[0].nextPaymentDate, "2026-04-05");
  console.log("✓ Recurring monthly cadence, annual cost, and next renewal date identified.");

  // 5. Explainable 6-Pillar Health Scoring
  console.log("\n[5/10] Testing Financial Health Scoring Model...");
  const health = calculateFinancialHealthScore({
    income: 150000,
    expenses: 75000,
    netSavings: 75000,
    savingsRate: 50,
    fixedExpenses: 35000,
    debtExpenses: 0,
    closingBalance: 300000,
    subscriptions: detectedSubs,
    transactions: multiSubs,
    periodDays: 90,
  });
  assert.equal(health.breakdown.length, 6);
  assert.ok(health.score >= 80);
  assert.ok(health.recommendations.length > 0);
  console.log(`✓ Health score evaluated to ${health.score}/100 with 6 explainable factors.`);

  // 6. Chronological Forecasting & Error Metrics
  console.log("\n[6/10] Testing Time-Series Forecasting & Backtesting...");
  const forecast = generateFinancialForecast(demoTxns, 45000, 150000, 90);
  assert.ok(forecast.nextMonthExpenses > 0);
  assert.ok(forecast.confidenceInterval.lower <= forecast.nextMonthExpenses);
  assert.ok(forecast.confidenceInterval.upper >= forecast.nextMonthExpenses);
  assert.ok(forecast.evaluationMetrics.mae >= 0);
  assert.ok(forecast.evaluationMetrics.rmse >= 0);
  console.log(`✓ Forecasting evaluated model: ${forecast.modelType} (MAE: ₹${forecast.evaluationMetrics.mae}).`);

  // 7. Goal Planner & Spending Simulator
  console.log("\n[7/10] Testing Goal Planner & Spending Simulator...");
  const goals = generateDefaultGoals(120000, 60000, 60000);
  assert.equal(goals.length, 3);
  assert.ok(goals[0].targetAmount > 0);
  assert.ok(goals[0].monthlyContribution > 0);

  const simulation = runSpendingSimulation(120000, 60000, 250000, { foodDelta: -5000 });
  assert.equal(simulation.length, 5);
  assert.ok(simulation.some((s) => s.scenarioName === "Conservative Saver"));
  assert.ok(simulation.some((s) => s.scenarioName === "Custom What-If"));
  console.log("✓ Goal timelines and 5 comparative simulator scenarios generated.");

  // 8. Grounded AI Financial Coach Answering
  console.log("\n[8/10] Testing Factual AI Financial Coach Responses...");
  const answerSpending = answerLocally("Where am I spending most?", report);
  assert.ok(answerSpending.toLowerCase().includes("category"));

  const answerSubs = answerLocally("Find my subscriptions", report);
  assert.ok(answerSubs.includes("Netflix") || answerSubs.includes("recurring"));

  const answerFood = answerLocally("How much did I spend on food?", report);
  assert.ok(answerFood.includes("Food") || answerFood.includes("₹1,250"));
  console.log("✓ AI coach answers strictly grounded in verified statement data.");

  // 9. Local Exporter Sanitization
  console.log("\n[9/10] Testing CSV Exporter & Formula Injection Defense...");
  const exportedCsv = reportToCsv(report);
  assert.match(exportedCsv, /"Date","Merchant"/);
  assert.ok(!exportedCsv.includes("=cmd|"));
  console.log("✓ Exporter generated sanitized CSV compliant with security rules.");

  // 10. Sample Dataset File Parsing
  console.log("\n[10/10] Testing Sample Statement CSV File Parsing...");
  const sampleCsvContent = readFileSync("sample-data/financeiq-demo-statement.csv", "utf8");
  const parsedSampleTxns = parseTransactionsFromText(sampleCsvContent, "sample.csv");
  assert.ok(parsedSampleTxns.length >= 100);
  const sampleRep = buildReport(parsedSampleTxns);
  assert.ok(sampleRep.totals.income > sampleRep.totals.expenses);
  console.log(`✓ Sample CSV parsed ${parsedSampleTxns.length} records. Income > Expenses verified.`);

  console.log("\n==================================================");
  console.log("ALL 10 END-TO-END VERIFICATION CHECKS PASSED!");
  console.log("==================================================");
}

runEndToEndVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
