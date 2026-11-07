import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildReport, categorize, parseTransactionsFromText } from "./finance-engine";
import { reportToCsv, safeCsvCell } from "./exporters";

const statement = `
01/05/2026 ACME Payroll Salary credit 120000
02/05/2026 Swiggy UPI debit 980
03/05/2026 Netflix Subscription debit 649
04/05/2026 Groww SIP debit 15000
02/06/2026 ACME Payroll Salary credit 125000
04/06/2026 Netflix Subscription debit 649
`;

const transactions = parseTransactionsFromText(statement);
assert.equal(transactions.length, 6);
assert.equal(transactions.filter((txn) => txn.type === "income").length, 2);
assert.equal(transactions[0].date, "2026-05-01");

const report = buildReport(transactions);
assert.ok(report.health.score > 0);
assert.equal(report.totals.income, 245000);
assert.ok(report.subscriptions.some((subscription) => subscription.merchant.includes("Netflix")));
assert.ok(report.categories.some((category) => category.name === "Investments"));

assert.equal(categorize("BigBasket Grocery debit", -4200), "Groceries");
assert.equal(categorize("Groww SIP Investment debit", -15000), "Investments");
assert.equal(categorize("ACME Payroll Salary credit", 120000), "Salary");
assert.equal(categorize("Urban Nest Rent debit", -42000), "Housing");
assert.equal(categorize("HDFC Life Insurance debit", -5200), "Insurance");
assert.equal(safeCsvCell("=IMPORTXML(\"http://example.com\")"), "\"'=IMPORTXML(\"\"http://example.com\"\")\"");

const sampleStatement = readFileSync("sample-data/financeiq-demo-statement.csv", "utf8");
const sampleTransactions = parseTransactionsFromText(sampleStatement);
assert.ok(sampleTransactions.length >= 100);

const sampleReport = buildReport(sampleTransactions);
assert.ok(sampleReport.totals.income > sampleReport.totals.expenses);
assert.ok(sampleReport.salary.detected);
assert.ok(sampleReport.categories.some((category) => category.name === "Food"));
assert.ok(sampleReport.categories.some((category) => category.name === "Housing"));
assert.ok(sampleReport.categories.some((category) => category.name === "Insurance"));
assert.ok(sampleReport.categories.some((category) => category.name === "Debt"));
assert.ok(sampleReport.subscriptions.some((subscription) => subscription.merchant.includes("Netflix")));
assert.ok(sampleReport.subscriptions.some((subscription) => subscription.merchant.includes("Spotify")));
assert.ok(!sampleReport.subscriptions.some((subscription) => /rent|insurance/i.test(subscription.merchant)));
assert.ok(sampleReport.merchants.length > 3);
assert.ok(sampleReport.forecasting.nextMonthExpenses > 0);
assert.ok(sampleReport.weekendVsWeekday.weekend > 0);
assert.ok(sampleReport.weekendVsWeekday.weekday > 0);
assert.match(reportToCsv(sampleReport), /Date,|\"Date\"/);

// Verify upgraded financial intelligence modules
assert.equal(sampleReport.health.breakdown.length, 6);
assert.ok(sampleReport.health.score >= 0 && sampleReport.health.score <= 100);
assert.ok(sampleReport.forecasting.nextMonthExpenses > 0);
assert.ok(sampleReport.forecasting.evaluationMetrics.mae >= 0);
assert.ok(sampleReport.goals.length >= 3);
assert.ok(sampleReport.simulationScenarios.length >= 4);
assert.ok(sampleReport.balances.calculatedClosing.amount !== undefined);

// Test multi-column bank statement with debit & credit columns and running balance
const hdfcBankCsv = `Date,Narration,Chq/Ref No,Value Dt,Withdrawal Amt,Deposit Amt,Closing Balance
01/04/2026,ACME CORP SALARY APRIL,SAL123,01/04/2026,,150000.00,250000.00
02/04/2026,SWIGGY BANGALORE UPI,UPI999,02/04/2026,850.00,,249150.00
03/04/2026,NETFLIX RECURRING,NETFLIX1,03/04/2026,649.00,,248501.00
04/04/2026,SELF TRANSFER TO SAVINGS,TRF777,04/04/2026,20000.00,,228501.00
`;
const hdfcTxns = parseTransactionsFromText(hdfcBankCsv, "hdfc.csv");
assert.equal(hdfcTxns.length, 4);
assert.equal(hdfcTxns[0].credit, 150000);
assert.equal(hdfcTxns[1].debit, 850);
assert.equal(hdfcTxns[3].type, "transfer");

const hdfcReport = buildReport(hdfcTxns);
assert.equal(hdfcReport.totals.income, 150000);
assert.equal(hdfcReport.totals.expenses, 1499); // 850 + 649 (excluding transfer)
assert.equal(hdfcReport.totals.transfers, 20000);

console.log("finance-engine tests passed");
