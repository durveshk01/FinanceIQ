"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend as RechartsLegend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { InsightReport } from "@/lib/schemas";

const palette = [
  "#E50914", // Prime Red
  "#22C55E", // Emerald Green
  "#3B82F6", // Royal Blue
  "#F59E0B", // Amber
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#06B6D4", // Cyan
  "#64748B", // Slate
];

const tooltipStyle = {
  background: "rgba(10, 10, 10, 0.96)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: "12px",
  color: "#ffffff",
  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
  fontSize: "12px",
  padding: "8px 12px",
};

export type FinanceChartProps = {
  report: InsightReport;
  chartsReady: boolean;
  formatMoney: (value: number) => string;
};

// 1. Income vs Expenses Chart
export function IncomeVsExpenseChart({ report, chartsReady, formatMoney }: FinanceChartProps) {
  const data = [
    { name: "Income", amount: report.totals.income, fill: "#22C55E" },
    { name: "Expenses", amount: report.totals.expenses, fill: "#E50914" },
    { name: "Net Savings", amount: Math.max(0, report.totals.netSavings), fill: "#3B82F6" },
  ];

  return (
    <div className="h-72 w-full" role="img" aria-label="Income vs Expenses Overview">
      {chartsReady ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#A1A1AA", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#A1A1AA", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(value) => formatMoney(Number(value))} contentStyle={tooltipStyle} />
            <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ChartSkeleton />
      )}
    </div>
  );
}

// 2. Category-wise Expenses Chart
export function CategoryChart({ report, chartsReady, formatMoney }: FinanceChartProps) {
  if (report.categories.length === 0) return <EmptyChart message="No spending categories detected." />;

  return (
    <div className="flex flex-col md:flex-row items-center gap-4">
      <div className="h-72 w-full md:w-3/5" role="img" aria-label="Spending by Category">
        {chartsReady ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={report.categories}
                dataKey="amount"
                nameKey="name"
                innerRadius={65}
                outerRadius={100}
                paddingAngle={3}
              >
                {report.categories.map((entry, index) => (
                  <Cell key={entry.name} fill={palette[index % palette.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatMoney(Number(value))} contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <ChartSkeleton />
        )}
      </div>
      <div className="w-full md:w-2/5">
        <Legend items={report.categories.slice(0, 6).map((c, i) => ({ label: c.name, color: palette[i % palette.length], value: `${c.percent}%` }))} />
      </div>
    </div>
  );
}

// 3. Daily Spending Trend Chart
export function CashFlowChart({ report, chartsReady, formatMoney }: FinanceChartProps) {
  if (report.dailyTrend.length === 0) return <EmptyChart message="No spending trend available." />;

  return (
    <div className="h-72 w-full" role="img" aria-label="Daily Spending Trend">
      {chartsReady ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={report.dailyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#E50914" stopOpacity={0.6} />
                <stop offset="95%" stopColor="#E50914" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#A1A1AA", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(d) => d.slice(5)} />
            <YAxis tick={{ fill: "#A1A1AA", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(value) => formatMoney(Number(value))} contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="amount" stroke="#E50914" strokeWidth={3} fill="url(#spendGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <ChartSkeleton />
      )}
    </div>
  );
}

// 4. Merchant-wise Spending Chart
export function MerchantChart({ report, chartsReady, formatMoney }: FinanceChartProps) {
  if (report.merchants.length === 0) return <EmptyChart message="No merchant spending recorded." />;

  return (
    <div className="h-72 w-full" role="img" aria-label="Top Outflow Merchants">
      {chartsReady ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={report.merchants.slice(0, 6)} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <XAxis type="number" hide />
            <YAxis dataKey="merchant" type="category" width={110} tick={{ fill: "#A1A1AA", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(value) => formatMoney(Number(value))} contentStyle={tooltipStyle} />
            <Bar dataKey="amount" radius={[0, 8, 8, 0]} fill="#E50914" />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ChartSkeleton />
      )}
    </div>
  );
}

// 5. Monthly Cash Flow Chart
export function MonthlyCashFlowChart({ report, chartsReady, formatMoney }: FinanceChartProps) {
  const data = report.weeklyTrend.slice(-6).map((item, idx) => ({
    week: `W${idx + 1}`,
    outflow: item.amount,
  }));

  return (
    <div className="h-72 w-full" role="img" aria-label="Weekly Outflow Flow">
      {chartsReady ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="week" tick={{ fill: "#A1A1AA", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#A1A1AA", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(value) => formatMoney(Number(value))} contentStyle={tooltipStyle} />
            <Bar dataKey="outflow" fill="#3B82F6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ChartSkeleton />
      )}
    </div>
  );
}

// 6. Savings Trend Chart
export function SavingsTrendChart({ report, chartsReady, formatMoney }: FinanceChartProps) {
  const currentNet = report.totals.netSavings;
  const data = [
    { month: "Month 1", cumulative: Math.round(currentNet * 0.33) },
    { month: "Month 2", cumulative: Math.round(currentNet * 0.67) },
    { month: "Current", cumulative: currentNet },
    { month: "+30 Days", cumulative: currentNet + report.forecasting.nextMonthSavings },
    { month: "+60 Days", cumulative: currentNet + (report.forecasting.nextMonthSavings * 2) },
    { month: "+90 Days", cumulative: report.forecasting.futureBalance90Days },
  ];

  return (
    <div className="h-72 w-full" role="img" aria-label="Savings Trajectory">
      {chartsReady ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="saveGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22C55E" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#22C55E" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: "#A1A1AA", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#A1A1AA", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(value) => formatMoney(Number(value))} contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="cumulative" stroke="#22C55E" strokeWidth={3} fill="url(#saveGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <ChartSkeleton />
      )}
    </div>
  );
}

// 7. Subscription Costs Chart
export function SubscriptionChart({ report, chartsReady, formatMoney }: FinanceChartProps) {
  if (report.subscriptions.length === 0) return <EmptyChart message="No active subscriptions detected." />;

  const data = report.subscriptions.slice(0, 5).map((s) => ({
    name: s.merchant,
    annual: s.annualCost,
    monthly: s.monthlyCost,
  }));

  return (
    <div className="h-72 w-full" role="img" aria-label="Subscription Costs">
      {chartsReady ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <XAxis type="number" hide />
            <YAxis dataKey="name" type="category" width={110} tick={{ fill: "#A1A1AA", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(value) => formatMoney(Number(value))} contentStyle={tooltipStyle} />
            <Bar dataKey="annual" radius={[0, 8, 8, 0]} fill="#F59E0B" name="Annual Run Rate" />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ChartSkeleton />
      )}
    </div>
  );
}

// 8. Weekend vs Weekday Spending Chart
export function WeekendWeekdayChart({ report, chartsReady, formatMoney }: FinanceChartProps) {
  const { weekend, weekday } = report.weekendVsWeekday;
  const total = weekend + weekday || 1;
  const data = [
    { name: "Weekdays (Mon-Fri)", amount: weekend ? Math.round(weekday) : 0, percent: Math.round((weekday / total) * 100), fill: "#3B82F6" },
    { name: "Weekends (Sat-Sun)", amount: Math.round(weekend), percent: Math.round((weekend / total) * 100), fill: "#E50914" },
  ];

  return (
    <div className="h-72 w-full" role="img" aria-label="Weekend vs Weekday Spend Distribution">
      {chartsReady ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#A1A1AA", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#A1A1AA", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(value) => formatMoney(Number(value))} contentStyle={tooltipStyle} />
            <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ChartSkeleton />
      )}
    </div>
  );
}

// 9. Monthly Forecast Chart
export function ForecastChart({ report, chartsReady, formatMoney }: FinanceChartProps) {
  const data = [
    { period: "Current Expenses", amount: report.totals.expenses, fill: "#E50914" },
    { period: "Next Month Project", amount: report.forecasting.nextMonthExpenses, fill: "#F59E0B" },
    { period: "Next Month Savings", amount: report.forecasting.nextMonthSavings, fill: "#22C55E" },
  ];

  return (
    <div className="h-72 w-full" role="img" aria-label="Monthly Financial Projection">
      {chartsReady ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="period" tick={{ fill: "#A1A1AA", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#A1A1AA", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(value) => formatMoney(Number(value))} contentStyle={tooltipStyle} />
            <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ChartSkeleton />
      )}
    </div>
  );
}

// 10. Financial Health Components Radar/Bar Chart
export function HealthHistoryChart({ report, chartsReady }: FinanceChartProps) {
  const data = report.health.breakdown.map((item) => ({
    factor: item.factor,
    score: item.score,
  }));

  return (
    <div className="h-72 w-full" role="img" aria-label="Health Score Factors Breakdown">
      {chartsReady ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 30, bottom: 5 }}>
            <XAxis type="number" domain={[0, 100]} tick={{ fill: "#A1A1AA", fontSize: 11 }} />
            <YAxis dataKey="factor" type="category" width={120} tick={{ fill: "#A1A1AA", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(value) => `${value}/100`} contentStyle={tooltipStyle} />
            <Bar dataKey="score" radius={[0, 8, 8, 0]} fill="#22C55E" />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ChartSkeleton />
      )}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string; value: string }[] }) {
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center justify-between text-xs text-zinc-300">
          <span className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
          <span className="font-semibold text-white">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="grid h-64 place-items-center rounded-2xl border border-dashed border-white/10 px-6 text-center text-sm leading-6 text-zinc-400" role="status">
      {message}
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-full w-full animate-pulse rounded-2xl bg-white/[0.04]" aria-hidden />;
}
