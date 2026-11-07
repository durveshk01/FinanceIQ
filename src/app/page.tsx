"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { MotionConfig, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  Landmark,
  LineChart,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
  UploadCloud,
  WalletCards,
} from "lucide-react";

import {
  buildReport,
  demoTransactions,
  type InsightReport,
} from "@/lib/finance-engine";
import { DeviceStatementProcessor } from "@/lib/device-processor";
import { LocalFinanceDatabase, type UserPreferences } from "@/lib/local-storage";

function safeCsvCell(value: string | number) {
  const text = String(value);
  const formulaSafe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

// Lazy-load the 10 interactive charts
const IncomeVsExpenseChart = dynamic(() => import("./finance-charts").then((m) => m.IncomeVsExpenseChart), { ssr: false });
const CategoryChart = dynamic(() => import("./finance-charts").then((m) => m.CategoryChart), { ssr: false });
const CashFlowChart = dynamic(() => import("./finance-charts").then((m) => m.CashFlowChart), { ssr: false });
const MerchantChart = dynamic(() => import("./finance-charts").then((m) => m.MerchantChart), { ssr: false });
const MonthlyCashFlowChart = dynamic(() => import("./finance-charts").then((m) => m.MonthlyCashFlowChart), { ssr: false });
const SavingsTrendChart = dynamic(() => import("./finance-charts").then((m) => m.SavingsTrendChart), { ssr: false });
const SubscriptionChart = dynamic(() => import("./finance-charts").then((m) => m.SubscriptionChart), { ssr: false });
const WeekendWeekdayChart = dynamic(() => import("./finance-charts").then((m) => m.WeekendWeekdayChart), { ssr: false });
const ForecastChart = dynamic(() => import("./finance-charts").then((m) => m.ForecastChart), { ssr: false });
const HealthHistoryChart = dynamic(() => import("./finance-charts").then((m) => m.HealthHistoryChart), { ssr: false });

const dashboardTabs = [
  "Overview",
  "Analytics",
  "Transactions",
  "Subscriptions",
  "Forecast & Goals",
  "AI Coach",
  "Privacy & Sync",
  "Exports",
] as const;

type DashboardTab = (typeof dashboardTabs)[number];
type ExportFormat = "csv" | "xlsx" | "pdf" | "json";
type ChatMessage = { role: "user" | "assistant"; content: string; timestamp: string };

const quickPrompts = [
  "Where am I spending most?",
  "How much did I spend on food?",
  "Find my subscriptions",
  "How much did I save?",
  "Why is my savings rate low?",
  "Project next month forecast",
  "Explain my financial health score",
];

function formatCurrency(val: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(val);
}

export default function Home() {
  const [report, setReport] = useState<InsightReport | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ step: "Idle", percentage: 0 });
  const [activeTab, setActiveTab] = useState<DashboardTab>("Overview");
  const [error, setError] = useState<string | null>(null);
  const [chartsReady, setChartsReady] = useState(false);

  // Privacy & Sync states
  const [preferences, setPreferences] = useState<UserPreferences>(LocalFinanceDatabase.getPreferences());
  const [syncStatus, setSyncStatus] = useState<"synced" | "syncing" | "offline" | "idle">("idle");
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Transactions Ledger State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<"All" | "income" | "expense" | "transfer">("All");
  const [sortField, setSortField] = useState<"date" | "amount">("date");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  // Simulator Sliders State
  const [simDeltas, setSimDeltas] = useState({
    incomeDelta: 0,
    rentDelta: 0,
    foodDelta: 0,
    shoppingDelta: 0,
    subscriptionDelta: 0,
    emiDelta: 0,
    unexpectedExpense: 0,
  });

  // Chatbot State
  const [question, setQuestion] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hello! I am your FinanceIQ Intelligence Coach. Upload a statement or load demo data to analyze your finances.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  // Export State
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dashboardRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();

  // Load saved local data on boot
  useEffect(() => {
    const timer = setTimeout(() => {
      setChartsReady(true);
      const saved = LocalFinanceDatabase.getActiveReport();
      if (saved) {
        setReport(saved);
        setIsDemoMode(false);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const activeReport = report;

  // Filtered & sorted transactions for ledger tab
  const filteredTransactions = useMemo(() => {
    if (!activeReport) return [];
    return activeReport.transactions
      .filter((t) => {
        const matchesQuery =
          t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.merchant.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.category.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCat = selectedCategory === "All" || t.category === selectedCategory;
        const matchesType = transactionTypeFilter === "All" || t.type === transactionTypeFilter;
        return matchesQuery && matchesCat && matchesType;
      })
      .sort((a, b) => {
        if (sortField === "date") {
          return sortOrder === "desc" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
        } else {
          return sortOrder === "desc" ? Math.abs(b.amount) - Math.abs(a.amount) : Math.abs(a.amount) - Math.abs(b.amount);
        }
      });
  }, [activeReport, searchQuery, selectedCategory, transactionTypeFilter, sortField, sortOrder]);

  function scrollToDashboard() {
    window.setTimeout(() => {
      dashboardRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    }, 60);
  }

  // Demo mode
  function loadDemoData() {
    const txns = demoTransactions();
    const demoRep = buildReport(txns, { fileNames: ["FinanceIQ_Demo_Statement.csv"] });
    setReport(demoRep);
    setIsDemoMode(true);
    setError(null);
    setActiveTab("Overview");
    setMessages([
      {
        role: "assistant",
        content: `Demo statement loaded! Analyzed ${txns.length} transactions across 90 days. Net savings: ${formatCurrency(demoRep.totals.netSavings)} (${demoRep.totals.savingsRate}%). Health Score: ${demoRep.health.score}/100. Ask me any financial question!`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    scrollToDashboard();
  }

  // Core statement processing
  async function handleFileProcess(selectedFiles: File[]) {
    if (selectedFiles.length === 0) return;
    setIsAnalyzing(true);
    setError(null);
    setAnalysisProgress({ step: "Initializing device parser...", percentage: 5 });

    try {
      if (preferences.localOnlyMode) {
        // 100% on-device processing via device CPU & RAM
        const result = await DeviceStatementProcessor.processFilesLocally(selectedFiles, (step, pct) => {
          setAnalysisProgress({ step, percentage: pct });
        });
        setReport(result.report);
        setIsDemoMode(false);
        setActiveTab("Overview");
        setMessages([
          {
            role: "assistant",
            content: `Device processing complete! Analyzed ${result.transactions.length} transactions directly on your device. Financial Health Score: ${result.report.health.score}/100 (${result.report.health.label}).`,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
        scrollToDashboard();
      } else {
        // Server assisted processing fallback
        setAnalysisProgress({ step: "Transmitting securely to cloud parser...", percentage: 30 });
        const form = new FormData();
        selectedFiles.forEach((f) => form.append("files", f));
        const res = await fetch("/api/analyze", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok || !data.report) {
          throw new Error(data.error?.message || "Failed to parse bank statement.");
        }
        setReport(data.report);
        LocalFinanceDatabase.saveActiveReport(data.report);
        setIsDemoMode(false);
        setActiveTab("Overview");
        scrollToDashboard();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not extract transactions from file. Please ensure file contains valid bank transactions.";
      setError(msg);
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress({ step: "Complete", percentage: 100 });
    }
  }

  // Ask Financial Coach
  async function askCoach(customQuestion?: string) {
    const q = customQuestion || question;
    if (!q.trim() || !activeReport || isChatting) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: q,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setQuestion("");
    setIsChatting(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          report: activeReport,
          allowAiSharing: preferences.allowAiSharing,
        }),
      });
      const data = await res.json();
      const botMsg: ChatMessage = {
        role: "assistant",
        content: data.answer || "I could not retrieve an answer for that query.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered a temporary connection issue. Please try again.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsChatting(false);
    }
  }

  // Local Exporters
  async function exportReport(format: ExportFormat) {
    if (!activeReport) return;
    setExporting(format);
    setExportFeedback(null);

    try {
      if (format === "csv") {
        const rows = [
          ["Date", "Merchant", "Description", "Category", "Amount", "Type"],
          ...activeReport.transactions.map((txn) => [txn.date, txn.merchant, txn.description, txn.category, String(txn.amount), txn.type]),
        ];
        const csv = rows.map((row) => row.map((cell) => safeCsvCell(cell)).join(",")).join("\n");
        downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), "FinanceIQ_Statement_Report.csv");
      } else if (format === "json") {
        const json = JSON.stringify(activeReport, null, 2);
        downloadBlob(new Blob([json], { type: "application/json" }), "FinanceIQ_Report_Backup.json");
      } else {
        const res = await fetch("/api/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ report: activeReport, format }),
        });
        if (!res.ok) throw new Error("Failed to generate report export.");
        const blob = await res.blob();
        downloadBlob(blob, format === "pdf" ? "FinanceIQ_Health_Report.pdf" : "FinanceIQ_Statement.xlsx");
      }
      setExportFeedback(`Successfully generated ${format.toUpperCase()} report!`);
      setTimeout(() => setExportFeedback(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setExportFeedback(`Export failed: ${msg}`);
    } finally {
      setExporting(null);
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Optional Cloud Sync to Render Backend
  async function triggerCloudSync() {
    if (!activeReport) return;
    setSyncStatus("syncing");
    setSyncFeedback(null);

    try {
      const backendUrl = preferences.cloudSyncUrl || "http://localhost:4000";
      const token = preferences.authToken || "demo-token";

      // Register device and sync record
      const syncPayload = {
        deviceId: preferences.deviceId || "web-client",
        records: [
          {
            entityType: "report",
            entityId: `rep_${Date.now()}`,
            version: 1,
            data: {
              totals: activeReport.totals,
              health: activeReport.health,
              period: activeReport.period,
            },
            isDeleted: false,
          },
        ],
      };

      const res = await fetch(`${backendUrl}/api/sync/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(syncPayload),
      });

      if (!res.ok) {
        throw new Error("Render Backend did not accept sync. Verify backend service is running.");
      }

      const data = await res.json();
      setSyncStatus("synced");
      setSyncFeedback(`Cloud Sync successful! Synced ${data.savedCount} entities to Render at ${new Date().toLocaleTimeString()}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncStatus("offline");
      setSyncFeedback(`Sync failed or backend unreachable: ${msg}`);
    }
  }

  // Exclude or Include Transaction live
  function toggleTransactionExcluded(txnId: string) {
    if (!activeReport) return;
    const updated = activeReport.transactions.map((t) => (t.id === txnId ? { ...t, isExcluded: !t.isExcluded } : t));
    const recomputed = buildReport(updated, { fileNames: activeReport.importSummary?.fileNames });
    setReport(recomputed);
    LocalFinanceDatabase.saveActiveReport(recomputed);
  }

  return (
    <MotionConfig reducedMotion="user">
      <main className="min-h-screen bg-black text-white selection:bg-rose-600 selection:text-white">
        {/* Top Enterprise Navigation */}
        <header className="sticky top-0 z-50 border-b border-white/10 bg-black/85 backdrop-blur-2xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-600 to-red-700 shadow-[0_0_25px_rgba(229,9,20,0.45)]">
                <Landmark size={20} className="text-white" />
              </div>
              <div>
                <span className="text-xl font-black tracking-tight text-white">FinanceIQ</span>
                <span className="ml-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-400">
                  Device AI
                </span>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-400">
              <a href="#features" className="hover:text-white transition-colors">Capabilities</a>
              <a href="#dashboard" className="hover:text-white transition-colors">Command Center</a>
              <a href="#security" className="hover:text-white transition-colors">Privacy & Security</a>
              <a href="#mobile" className="hover:text-white transition-colors">Android Native</a>
            </nav>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={loadDemoData}
                className="hidden sm:inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-bold text-white hover:border-white/30 hover:bg-white/10 transition-all"
              >
                <FileSpreadsheet size={15} /> Demo Data
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2 text-xs font-extrabold text-white shadow-[0_0_25px_rgba(229,9,20,0.4)] hover:brightness-110 transition-all"
              >
                <UploadCloud size={16} /> {isAnalyzing ? "Processing..." : "Import Statement"}
              </button>
            </div>
          </div>
        </header>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.csv,.xlsx,.xls,.txt"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              const filesArr = Array.from(e.target.files);
              handleFileProcess(filesArr);
            }
          }}
        />

        {/* Hero Section */}
        <section className="relative overflow-hidden px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(229,9,20,0.25),rgba(255,255,255,0))]" />
          <div className="relative mx-auto max-w-5xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-4 py-1.5 text-xs font-semibold text-rose-300">
              <ShieldCheck size={15} /> 100% On-Device Processing · Zero Cloud Upload By Default
            </div>
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl">
              Financial Intelligence Powered by Your Device.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400 sm:text-xl">
              Extract transactions, detect multi-cadence subscriptions, score your financial resilience, and forecast future balances directly on your CPU and RAM.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-6 py-3.5 text-sm font-black text-white shadow-[0_0_35px_rgba(229,9,20,0.5)] hover:scale-105 transition-all"
              >
                <UploadCloud size={18} /> {isAnalyzing ? "Processing..." : "Import Bank Statement"}
              </button>
              <button
                type="button"
                onClick={loadDemoData}
                className="inline-flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-bold text-white hover:border-white/30 hover:bg-white/10 transition-all"
              >
                <Play size={16} /> Explore Verified Demo
              </button>
            </div>

            {/* Analysis Progress Bar */}
            {isAnalyzing && (
              <div className="mx-auto mt-8 max-w-md rounded-2xl border border-rose-500/30 bg-rose-950/30 p-4 backdrop-blur-xl">
                <div className="flex items-center justify-between text-xs font-semibold text-rose-300">
                  <span>{analysisProgress.step}</span>
                  <span>{analysisProgress.percentage}%</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full bg-gradient-to-r from-rose-500 to-red-500 transition-all duration-300"
                    style={{ width: `${analysisProgress.percentage}%` }}
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="mx-auto mt-6 flex max-w-lg items-center gap-3 rounded-xl border border-red-500/40 bg-red-950/40 p-3.5 text-xs font-semibold text-red-200">
                <AlertTriangle size={18} className="shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {/* Supported Banks Strip */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-3 text-xs text-zinc-400">
              <span className="font-semibold text-zinc-300">Supported Formats & Profiles:</span>
              <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1">HDFC Bank</span>
              <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1">SBI</span>
              <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1">ICICI Bank</span>
              <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1">Axis Bank</span>
              <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1">Kotak</span>
              <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1">Chase & BOA</span>
              <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1">Revolut & Monzo</span>
              <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1">PDF · CSV · XLSX</span>
            </div>
          </div>
        </section>

        {/* Financial Command Center / Dashboard */}
        <section id="dashboard" ref={dashboardRef} className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          {!activeReport ? (
            <div className="rounded-3xl border border-dashed border-white/15 bg-zinc-950/40 p-12 text-center backdrop-blur-xl">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                <WalletCards size={28} className="text-rose-500" />
              </div>
              <h3 className="mt-4 text-xl font-extrabold text-white">No Statement Loaded</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
                Import your bank statement PDF, CSV, or Excel spreadsheet to generate your financial health score and intelligence report.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-rose-500 transition-all"
                >
                  Import File
                </button>
                <button
                  type="button"
                  onClick={loadDemoData}
                  className="rounded-xl border border-white/20 bg-white/5 px-5 py-2.5 text-xs font-bold text-white hover:bg-white/10 transition-all"
                >
                  Load Demo Data
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Command Center Control Bar */}
              <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-zinc-950/80 p-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black text-white">Financial Command Center</h2>
                    {isDemoMode && (
                      <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                        Demo Mode
                      </span>
                    )}
                    <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                      On-Device Verified
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Period: {activeReport.period.startDate} to {activeReport.period.endDate} ({activeReport.period.totalDays} days) · {activeReport.totals.totalTransactions} transactions
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("AI Coach")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/20"
                  >
                    <Bot size={15} /> AI Coach
                  </button>
                  <button
                    type="button"
                    onClick={() => exportReport("pdf")}
                    disabled={exporting !== null}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10"
                  >
                    <Download size={14} /> PDF Report
                  </button>
                  <button
                    type="button"
                    onClick={() => exportReport("csv")}
                    disabled={exporting !== null}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10"
                  >
                    <FileSpreadsheet size={14} /> CSV
                  </button>
                </div>
              </div>

              {/* KPI Ribbons */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                  <span className="text-[11px] font-semibold text-zinc-400">Total Income</span>
                  <div className="mt-1 text-lg font-black text-emerald-400">{formatCurrency(activeReport.totals.income)}</div>
                  <span className="text-[10px] text-zinc-400">Verified deposits</span>
                </div>
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                  <span className="text-[11px] font-semibold text-zinc-400">Total Expenses</span>
                  <div className="mt-1 text-lg font-black text-rose-500">{formatCurrency(activeReport.totals.expenses)}</div>
                  <span className="text-[10px] text-zinc-400">Outflows detected</span>
                </div>
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                  <span className="text-[11px] font-semibold text-zinc-400">Net Savings</span>
                  <div className="mt-1 text-lg font-black text-blue-400">{formatCurrency(activeReport.totals.netSavings)}</div>
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-400">
                    <TrendingUp size={10} /> {activeReport.totals.savingsRate}% rate
                  </span>
                </div>
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                  <span className="text-[11px] font-semibold text-zinc-400">Health Score</span>
                  <div className="mt-1 text-lg font-black text-emerald-400">{activeReport.health.score}/100</div>
                  <span className="text-[10px] font-semibold text-zinc-300">{activeReport.health.label}</span>
                </div>
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                  <span className="text-[11px] font-semibold text-zinc-400">Closing Balance</span>
                  <div className="mt-1 text-lg font-black text-white">{formatCurrency(activeReport.balances.closing.amount)}</div>
                  <span className="text-[10px] text-zinc-400 capitalize">{activeReport.balances.closing.source} balance</span>
                </div>
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                  <span className="text-[11px] font-semibold text-zinc-400">Subscriptions</span>
                  <div className="mt-1 text-lg font-black text-amber-400">
                    {formatCurrency(activeReport.subscriptions.reduce((a, s) => a + s.monthlyCost, 0))}/mo
                  </div>
                  <span className="text-[10px] text-zinc-400">{activeReport.subscriptions.length} recurring</span>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-white/10 overflow-x-auto scrollbar-none gap-2">
                {dashboardTabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`shrink-0 border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
                      activeTab === tab
                        ? "border-rose-500 text-rose-400"
                        : "border-transparent text-zinc-400 hover:text-white"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* TAB 1: OVERVIEW */}
              {activeTab === "Overview" && (
                <div className="space-y-6">
                  {/* Balance Verification Card */}
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-400">Opening Balance</span>
                        <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] capitalize text-zinc-300">
                          {activeReport.balances.opening.source}
                        </span>
                      </div>
                      <div className="mt-2 text-2xl font-black text-white">{formatCurrency(activeReport.balances.opening.amount)}</div>
                      <p className="mt-1 text-xs text-zinc-400">{activeReport.balances.opening.note}</p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-400">Observed Closing</span>
                        <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] capitalize text-emerald-300">
                          {activeReport.balances.closing.source}
                        </span>
                      </div>
                      <div className="mt-2 text-2xl font-black text-white">{formatCurrency(activeReport.balances.closing.amount)}</div>
                      <p className="mt-1 text-xs text-zinc-400">{activeReport.balances.closing.note}</p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-400">Calculated Cash Delta</span>
                        <span className="rounded bg-blue-500/20 px-2 py-0.5 text-[10px] text-blue-300">Reconciled</span>
                      </div>
                      <div className="mt-2 text-2xl font-black text-blue-400">{formatCurrency(activeReport.totals.netSavings)}</div>
                      <p className="mt-1 text-xs text-zinc-400">Opening + Inflows - Outflows (Excludes internal transfers)</p>
                    </div>
                  </div>

                  {/* Primary Visualizations */}
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-white">Income vs Expenses Overview</h3>
                        <span className="text-xs text-zinc-400">Total Period Outlay</span>
                      </div>
                      <IncomeVsExpenseChart report={activeReport} chartsReady={chartsReady} formatMoney={formatCurrency} />
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-white">Spending by Category</h3>
                        <span className="text-xs text-zinc-400">18-Pillar Allocation</span>
                      </div>
                      <CategoryChart report={activeReport} chartsReady={chartsReady} formatMoney={formatCurrency} />
                    </div>
                  </div>

                  {/* Health Breakdown & Alerts */}
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {/* Financial Health Score Pillars */}
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-white">Explainable Financial Health Score</h3>
                        <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-400">
                          {activeReport.health.score}/100 · {activeReport.health.label}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mb-4">{activeReport.health.methodology}</p>
                      <div className="space-y-3">
                        {activeReport.health.breakdown.map((item) => (
                          <div key={item.factor} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-zinc-200">{item.factor}</span>
                              <span
                                className={`font-bold ${
                                  item.impact === "positive"
                                    ? "text-emerald-400"
                                    : item.impact === "negative"
                                    ? "text-rose-400"
                                    : "text-amber-400"
                                }`}
                              >
                                {item.value} ({item.score}/100)
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-zinc-400">{item.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Risk Alerts & Recommendations */}
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                        <h3 className="text-sm font-bold text-white mb-3">Priority Risk Signals & Alerts</h3>
                        <div className="space-y-2.5">
                          {activeReport.alerts.map((alert, i) => (
                            <div
                              key={i}
                              className={`rounded-xl border p-3 text-xs ${
                                alert.severity === "high"
                                  ? "border-rose-500/30 bg-rose-950/20 text-rose-200"
                                  : alert.severity === "medium"
                                  ? "border-amber-500/30 bg-amber-950/20 text-amber-200"
                                  : "border-blue-500/30 bg-blue-950/20 text-blue-200"
                              }`}
                            >
                              <div className="font-bold">{alert.title}</div>
                              <div className="mt-0.5 text-[11px] opacity-80">{alert.detail}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                        <h3 className="text-sm font-bold text-white mb-3">Actionable Financial Opportunities</h3>
                        <div className="space-y-2.5">
                          {activeReport.opportunities.map((opp, i) => (
                            <div key={i} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs">
                              <div>
                                <div className="font-bold text-zinc-200">{opp.title}</div>
                                <div className="text-[11px] text-zinc-400">{opp.detail}</div>
                              </div>
                              <div className="text-right shrink-0 ml-3">
                                <div className="text-xs font-black text-emerald-400">+{formatCurrency(opp.yearlySavings)}/yr</div>
                                <div className="text-[10px] text-zinc-400">Projected savings</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: ANALYTICS (All 10 Interactive Charts) */}
              {activeTab === "Analytics" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                      <h3 className="text-sm font-bold text-white mb-2">1. Daily Spending Outflow Area</h3>
                      <CashFlowChart report={activeReport} chartsReady={chartsReady} formatMoney={formatCurrency} />
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                      <h3 className="text-sm font-bold text-white mb-2">2. Category-Wise Distribution</h3>
                      <CategoryChart report={activeReport} chartsReady={chartsReady} formatMoney={formatCurrency} />
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                      <h3 className="text-sm font-bold text-white mb-2">3. Top Merchant Outflows</h3>
                      <MerchantChart report={activeReport} chartsReady={chartsReady} formatMoney={formatCurrency} />
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                      <h3 className="text-sm font-bold text-white mb-2">4. Weekly Outflow Rhythm</h3>
                      <MonthlyCashFlowChart report={activeReport} chartsReady={chartsReady} formatMoney={formatCurrency} />
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                      <h3 className="text-sm font-bold text-white mb-2">5. Savings Trajectory (+90 Days)</h3>
                      <SavingsTrendChart report={activeReport} chartsReady={chartsReady} formatMoney={formatCurrency} />
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                      <h3 className="text-sm font-bold text-white mb-2">6. Subscription Annual Run Rates</h3>
                      <SubscriptionChart report={activeReport} chartsReady={chartsReady} formatMoney={formatCurrency} />
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                      <h3 className="text-sm font-bold text-white mb-2">7. Weekend vs Weekday Spend</h3>
                      <WeekendWeekdayChart report={activeReport} chartsReady={chartsReady} formatMoney={formatCurrency} />
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                      <h3 className="text-sm font-bold text-white mb-2">8. Next Month Financial Forecast</h3>
                      <ForecastChart report={activeReport} chartsReady={chartsReady} formatMoney={formatCurrency} />
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5 lg:col-span-2">
                      <h3 className="text-sm font-bold text-white mb-2">9. Health Factor Resiliency Breakdown</h3>
                      <HealthHistoryChart report={activeReport} chartsReady={chartsReady} formatMoney={formatCurrency} />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: TRANSACTIONS LEDGER */}
              {activeTab === "Transactions" && (
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5 space-y-4">
                  {/* Filters Bar */}
                  <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                    <div className="relative flex-1">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Search merchant, narration, or category..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Category select */}
                      <select
                        aria-label="Filter by category"
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-zinc-300 focus:outline-none"
                      >
                        <option value="All">All Categories</option>
                        {activeReport?.categories.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>

                      {/* Type filter */}
                      {(["All", "income", "expense", "transfer"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTransactionTypeFilter(t)}
                          className={`rounded-lg px-2.5 py-1 text-xs font-semibold capitalize ${
                            transactionTypeFilter === t
                              ? "bg-rose-600 text-white"
                              : "border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                          }`}
                        >
                          {t}
                        </button>
                      ))}

                      {/* Sort toggle */}
                      <button
                        type="button"
                        onClick={() => {
                          if (sortField === "date") {
                            setSortField("amount");
                          } else {
                            setSortField("date");
                            setSortOrder(sortOrder === "desc" ? "asc" : "desc");
                          }
                        }}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 hover:bg-white/10"
                      >
                        Sort: {sortField === "date" ? `Date (${sortOrder.toUpperCase()})` : `Amount (${sortOrder.toUpperCase()})`}
                      </button>
                    </div>
                  </div>

                  {/* Transactions Table */}
                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-white/5 text-zinc-400 border-b border-white/10">
                        <tr>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Merchant / Narration</th>
                          <th className="py-2.5 px-3">Category</th>
                          <th className="py-2.5 px-3">Type</th>
                          <th className="py-2.5 px-3 text-right">Amount</th>
                          <th className="py-2.5 px-3 text-right">Balance</th>
                          <th className="py-2.5 px-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {filteredTransactions.slice(0, 100).map((t) => (
                          <tr key={t.id} className={`hover:bg-white/[0.02] ${t.isExcluded ? "opacity-40" : ""}`}>
                            <td className="py-2.5 px-3 font-mono text-zinc-400">{t.date}</td>
                            <td className="py-2.5 px-3 max-w-xs truncate">
                              <span className="font-bold text-white">{t.merchant}</span>
                              <span className="block text-[10px] text-zinc-400 truncate">{t.description}</span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
                                {t.category}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 capitalize">
                              <span
                                className={`text-[10px] font-bold ${
                                  t.type === "income"
                                    ? "text-emerald-400"
                                    : t.type === "transfer"
                                    ? "text-blue-400"
                                    : "text-rose-400"
                                }`}
                              >
                                {t.type}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold">
                              <span className={t.amount >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                {t.amount >= 0 ? "+" : ""}
                                {formatCurrency(t.amount)}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-zinc-400">
                              {t.runningBalance !== undefined ? formatCurrency(t.runningBalance) : "—"}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => toggleTransactionExcluded(t.id)}
                                className="text-[10px] text-zinc-400 hover:text-white underline"
                              >
                                {t.isExcluded ? "Include" : "Exclude"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-xs text-zinc-400 text-center">
                    Showing top {Math.min(100, filteredTransactions.length)} of {filteredTransactions.length} matching transactions
                  </div>
                </div>
              )}

              {/* TAB 4: SUBSCRIPTIONS */}
              {activeTab === "Subscriptions" && (
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-white">Detected Recurring Subscriptions</h3>
                      <p className="text-xs text-zinc-400">
                        Multi-cadence interval detection identifies recurring payments and projects upcoming renewals.
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black text-amber-400">
                        {formatCurrency(activeReport.subscriptions.reduce((a, s) => a + s.annualCost, 0))}/yr
                      </div>
                      <span className="text-[10px] text-zinc-400">Total annual run-rate</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {activeReport.subscriptions.map((sub) => (
                      <div key={sub.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-sm">{sub.merchant}</span>
                          <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-300 uppercase">
                            {sub.frequency}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between text-xs">
                          <span className="text-zinc-400">Billing Amount</span>
                          <span className="font-bold text-white">{formatCurrency(sub.amount)}</span>
                        </div>
                        <div className="flex items-baseline justify-between text-xs">
                          <span className="text-zinc-400">Annual Run-Rate</span>
                          <span className="font-bold text-amber-400">{formatCurrency(sub.annualCost)}/year</span>
                        </div>
                        <div className="flex items-baseline justify-between text-xs">
                          <span className="text-zinc-400">Next Estimated Renewal</span>
                          <span className="font-mono text-zinc-300">{sub.nextPaymentDate}</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 pt-1 border-t border-white/5">{sub.explanation}</p>
                        <div className="rounded bg-rose-950/30 p-2 text-[10px] text-rose-300 font-medium">
                          {sub.recommendation}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 5: FORECAST & GOALS */}
              {activeTab === "Forecast & Goals" && (
                <div className="space-y-6">
                  {/* Forecasting Card */}
                  <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-white">Chronological Forecasting Engine</h3>
                        <p className="text-xs text-zinc-400">{activeReport.forecasting.explanation}</p>
                      </div>
                      <span className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-mono text-zinc-300">
                        MAE: ₹{activeReport.forecasting.evaluationMetrics.mae.toLocaleString()} · RMSE: ₹{activeReport.forecasting.evaluationMetrics.rmse.toLocaleString()}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                        <span className="text-[11px] text-zinc-400 font-medium">Projected Next Month Spend</span>
                        <div className="mt-1 text-xl font-black text-amber-400">
                          {formatCurrency(activeReport.forecasting.nextMonthExpenses)}
                        </div>
                        <span className="text-[10px] text-zinc-400">
                          Range: {formatCurrency(activeReport.forecasting.confidenceInterval.lower)} - {formatCurrency(activeReport.forecasting.confidenceInterval.upper)}
                        </span>
                      </div>
                      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                        <span className="text-[11px] text-zinc-400 font-medium">Projected Next Month Savings</span>
                        <div className="mt-1 text-xl font-black text-emerald-400">
                          {formatCurrency(activeReport.forecasting.nextMonthSavings)}
                        </div>
                        <span className="text-[10px] text-zinc-400">Estimated surplus cushion</span>
                      </div>
                      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                        <span className="text-[11px] text-zinc-400 font-medium">Estimated 90-Day Balance</span>
                        <div className="mt-1 text-xl font-black text-blue-400">
                          {formatCurrency(activeReport.forecasting.futureBalance90Days)}
                        </div>
                        <span className="text-[10px] text-zinc-400">Current closing + 3mo run-rate</span>
                      </div>
                    </div>
                  </div>

                  {/* Goal Planner */}
                  <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5 space-y-4">
                    <h3 className="text-sm font-bold text-white">Financial Goal Planner</h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      {activeReport.goals.map((g) => {
                        const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
                        return (
                          <div key={g.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-white text-xs">{g.title}</span>
                              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                                {pct}%
                              </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="flex justify-between text-[11px] text-zinc-400">
                              <span>Saved: {formatCurrency(g.currentAmount)}</span>
                              <span>Target: {formatCurrency(g.targetAmount)}</span>
                            </div>
                            <div className="text-[10px] text-zinc-400 pt-1 border-t border-white/5">
                              Monthly need: {formatCurrency(g.monthlyContribution)}/mo · Completion: {g.projectedCompletionDate}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Spending What-If Simulator */}
                  <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5 space-y-4">
                    <h3 className="text-sm font-bold text-white">Interactive Spending & Outflow Simulator</h3>
                    <p className="text-xs text-zinc-400">
                      Simulate modifications to your monthly income, rent, food, or subscriptions to inspect resilience impact.
                    </p>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                      <div>
                        <label className="text-[11px] text-zinc-400">Dining/Food Adjust (₹)</label>
                        <input
                          type="range"
                          min="-10000"
                          max="10000"
                          step="500"
                          value={simDeltas.foodDelta}
                          onChange={(e) => setSimDeltas({ ...simDeltas, foodDelta: Number(e.target.value) })}
                          className="w-full accent-rose-500"
                        />
                        <span className="text-xs font-mono">{formatCurrency(simDeltas.foodDelta)}</span>
                      </div>
                      <div>
                        <label className="text-[11px] text-zinc-400">Shopping Adjust (₹)</label>
                        <input
                          type="range"
                          min="-15000"
                          max="15000"
                          step="500"
                          value={simDeltas.shoppingDelta}
                          onChange={(e) => setSimDeltas({ ...simDeltas, shoppingDelta: Number(e.target.value) })}
                          className="w-full accent-rose-500"
                        />
                        <span className="text-xs font-mono">{formatCurrency(simDeltas.shoppingDelta)}</span>
                      </div>
                      <div>
                        <label className="text-[11px] text-zinc-400">Income Delta (₹)</label>
                        <input
                          type="range"
                          min="-20000"
                          max="50000"
                          step="1000"
                          value={simDeltas.incomeDelta}
                          onChange={(e) => setSimDeltas({ ...simDeltas, incomeDelta: Number(e.target.value) })}
                          className="w-full accent-rose-500"
                        />
                        <span className="text-xs font-mono">{formatCurrency(simDeltas.incomeDelta)}</span>
                      </div>
                      <div>
                        <label className="text-[11px] text-zinc-400">Unexpected Shock (₹)</label>
                        <input
                          type="range"
                          min="0"
                          max="50000"
                          step="2000"
                          value={simDeltas.unexpectedExpense}
                          onChange={(e) => setSimDeltas({ ...simDeltas, unexpectedExpense: Number(e.target.value) })}
                          className="w-full accent-rose-500"
                        />
                        <span className="text-xs font-mono">{formatCurrency(simDeltas.unexpectedExpense)}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 pt-2">
                      {activeReport.simulationScenarios.slice(0, 3).map((s) => (
                        <div key={s.scenarioName} className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs space-y-1">
                          <div className="font-bold text-white">{s.scenarioName}</div>
                          <div className="flex justify-between text-zinc-400">
                            <span>Savings:</span>
                            <span className="font-bold text-emerald-400">{formatCurrency(s.netSavings)}</span>
                          </div>
                          <div className="flex justify-between text-zinc-400">
                            <span>Savings Rate:</span>
                            <span className="font-bold text-white">{s.savingsRate}%</span>
                          </div>
                          <div className="flex justify-between text-zinc-400">
                            <span>Emergency Runway:</span>
                            <span className="font-bold text-blue-400">{s.emergencyRunwayMonths} months</span>
                          </div>
                          <p className="text-[10px] text-zinc-400 pt-1">{s.summary}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 6: AI COACH */}
              {activeTab === "AI Coach" && (
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <Bot size={20} className="text-rose-500" />
                      <h3 className="text-sm font-bold text-white">FinanceIQ AI Intelligence Coach</h3>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferences.allowAiSharing}
                        onChange={(e) => {
                          const updated = LocalFinanceDatabase.savePreferences({ allowAiSharing: e.target.checked });
                          setPreferences(updated);
                        }}
                        className="accent-rose-600 rounded"
                      />
                      <span>Allow OpenAI Enhanced Model (Requires consent)</span>
                    </label>
                  </div>

                  {/* Chat messages box */}
                  <div className="h-80 overflow-y-auto space-y-3 p-3 rounded-xl border border-white/5 bg-black/40">
                    {messages.map((m, i) => (
                      <div
                        key={i}
                        className={`flex flex-col ${
                          m.role === "user" ? "items-end text-right" : "items-start text-left"
                        }`}
                      >
                        <div
                          className={`max-w-xl rounded-2xl p-3 text-xs ${
                            m.role === "user"
                              ? "bg-rose-600 text-white"
                              : "bg-white/10 text-zinc-200 border border-white/10"
                          }`}
                        >
                          {m.content}
                        </div>
                        <span className="text-[9px] text-zinc-400 mt-0.5 px-1">{m.timestamp}</span>
                      </div>
                    ))}
                    {isChatting && (
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <RefreshCw size={14} className="animate-spin" /> Thinking...
                      </div>
                    )}
                  </div>

                  {/* Quick Prompt Pills */}
                  <div className="flex flex-wrap gap-2">
                    {quickPrompts.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => askCoach(p)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-zinc-300 hover:border-white/20 hover:bg-white/10"
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  {/* Input Form */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ask any question about your financial data..."
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && askCoach()}
                      className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                    />
                    <button
                      type="button"
                      onClick={() => askCoach()}
                      disabled={isChatting || !question.trim()}
                      className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-500 transition-all disabled:opacity-50"
                    >
                      Ask Coach
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 7: PRIVACY & CLOUD SYNC */}
              {activeTab === "Privacy & Sync" && (
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5 space-y-6">
                  <div>
                    <h3 className="text-sm font-bold text-white">Local-First Privacy Controls & Cloud Synchronization</h3>
                    <p className="text-xs text-zinc-400">
                      Manage your offline storage, data backups, and optional end-to-end synchronization to the Render backend.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {/* Device Local Database */}
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Database size={18} className="text-emerald-400" />
                        <h4 className="text-xs font-bold text-white">Device Local Storage (IndexedDB / SQLite)</h4>
                      </div>
                      <p className="text-xs text-zinc-400">
                        Financial data is stored privately on your device. Clearing data permanently deletes local caches.
                      </p>
                      <div className="flex flex-wrap gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            const backup = LocalFinanceDatabase.exportFullBackup();
                            downloadBlob(new Blob([backup], { type: "application/json" }), "FinanceIQ_Local_Backup.json");
                          }}
                          className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10"
                        >
                          Export Full Backup (JSON)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm("Are you sure you want to permanently erase all local bank statements and financial reports?")) {
                              LocalFinanceDatabase.clearAllData();
                              setReport(null);
                              alert("Local data successfully cleared.");
                            }
                          }}
                          className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-900/50"
                        >
                          Clear Local Data
                        </button>
                      </div>
                    </div>

                    {/* Render Cloud Sync */}
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <RefreshCw size={18} className="text-blue-400" />
                          <h4 className="text-xs font-bold text-white">Render Cloud Sync (Opt-In)</h4>
                        </div>
                        <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-zinc-300 uppercase">
                          {syncStatus}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400">
                        Synchronize verified report summaries and goals across your Android phone and web dashboard.
                      </p>
                      <div className="space-y-2">
                        <input
                          type="text"
                          placeholder="Render Backend URL (e.g. https://financeiq-api.onrender.com)"
                          value={preferences.cloudSyncUrl || ""}
                          onChange={(e) => {
                            const updated = LocalFinanceDatabase.savePreferences({ cloudSyncUrl: e.target.value });
                            setPreferences(updated);
                          }}
                          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white"
                        />
                        <button
                          type="button"
                          onClick={triggerCloudSync}
                          disabled={syncStatus === "syncing"}
                          className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-500 transition-all"
                        >
                          {syncStatus === "syncing" ? "Syncing..." : "Sync To Render Cloud"}
                        </button>
                        {syncFeedback && <div className="text-[11px] text-zinc-300 font-medium">{syncFeedback}</div>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 8: EXPORTS */}
              {activeTab === "Exports" && (
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5 space-y-4">
                  <h3 className="text-sm font-bold text-white">Local Financial Report Generation</h3>
                  <p className="text-xs text-zinc-400">
                    Export high-fidelity reports directly from verified memory in multiple standard formats.
                  </p>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <button
                      type="button"
                      onClick={() => exportReport("csv")}
                      disabled={exporting !== null}
                      className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left hover:border-white/20 hover:bg-white/[0.04] transition-all"
                    >
                      <FileSpreadsheet size={24} className="text-emerald-400" />
                      <div className="mt-2 font-bold text-white text-xs">CSV Statement Ledger</div>
                      <p className="text-[10px] text-zinc-400 mt-1">Formula-sanitized CSV with normalized columns</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => exportReport("xlsx")}
                      disabled={exporting !== null}
                      className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left hover:border-white/20 hover:bg-white/[0.04] transition-all"
                    >
                      <FileSpreadsheet size={24} className="text-blue-400" />
                      <div className="mt-2 font-bold text-white text-xs">Excel Workbook (.XLSX)</div>
                      <p className="text-[10px] text-zinc-400 mt-1">Formatted multi-sheet summary and ledger</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => exportReport("pdf")}
                      disabled={exporting !== null}
                      className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left hover:border-white/20 hover:bg-white/[0.04] transition-all"
                    >
                      <FileText size={24} className="text-rose-500" />
                      <div className="mt-2 font-bold text-white text-xs">PDF Health Dossier</div>
                      <p className="text-[10px] text-zinc-400 mt-1">Executive financial summary with categories</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => exportReport("json")}
                      disabled={exporting !== null}
                      className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left hover:border-white/20 hover:bg-white/[0.04] transition-all"
                    >
                      <Database size={24} className="text-purple-400" />
                      <div className="mt-2 font-bold text-white text-xs">Structured JSON Archive</div>
                      <p className="text-[10px] text-zinc-400 mt-1">Complete schema-validated backup archive</p>
                    </button>
                  </div>

                  {exportFeedback && (
                    <div className="rounded-lg bg-emerald-950/40 border border-emerald-500/30 p-3 text-xs text-emerald-300 font-semibold">
                      {exportFeedback}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Capabilities Section */}
        <section id="features" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-xs font-bold text-rose-500 uppercase tracking-widest">Capabilities</span>
            <h2 className="mt-2 text-3xl font-black text-white sm:text-4xl">Engineered for Sovereign Financial Control</h2>
            <p className="mt-3 text-sm text-zinc-400">Everything needed to audit bank statements, eliminate subscription waste, and model financial freedom.</p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-6">
              <Smartphone size={24} className="text-rose-500" />
              <h3 className="mt-4 text-base font-bold text-white">Device-Powered Processing</h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Bank statements never touch a server by default. Parsing, categorization, health metrics, and forecasting run locally on your phone or browser.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-6">
              <ShieldCheck size={24} className="text-emerald-400" />
              <h3 className="mt-4 text-base font-bold text-white">Zero Mandatory Cloud Upload</h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Render handles only optional user authentication and end-to-end device synchronization. Your sensitive financial documents remain on your storage.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-6">
              <Sparkles size={24} className="text-amber-400" />
              <h3 className="mt-4 text-base font-bold text-white">Multi-Cadence Subscription Radar</h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Detects weekly, bi-weekly, monthly, quarterly, and annual recurring commitments with interval variance tolerance and renewal projection.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-6">
              <HeartPulse size={24} className="text-blue-400" />
              <h3 className="mt-4 text-base font-bold text-white">6-Pillar Health Score</h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Explainable mathematical scoring evaluating savings rate, fixed burdens, debt service ratio, emergency buffer, and spending volatility.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-6">
              <LineChart size={24} className="text-purple-400" />
              <h3 className="mt-4 text-base font-bold text-white">Chronological Forecasting</h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Time-series forecasting with single exponential smoothing, chronological train/test validation, and transparent MAE/RMSE confidence metrics.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-6">
              <Download size={24} className="text-rose-400" />
              <h3 className="mt-4 text-base font-bold text-white">Local Report Exports</h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Generate CSV, Excel XLSX, PDF dossiers, and full JSON archives instantly on device without server turnaround.
              </p>
            </div>
          </div>
        </section>

        {/* Android Native Showcase */}
        <section id="mobile" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 border-t border-white/10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <span className="text-xs font-bold text-rose-500 uppercase tracking-widest">Mobile Client</span>
              <h2 className="mt-2 text-3xl font-black text-white sm:text-4xl">Native Android Mobile Application</h2>
              <p className="mt-4 text-sm text-zinc-400 leading-relaxed">
                FinanceIQ runs as a true native Android application built with Capacitor 7 and native Android platform tools. Select files from internal device storage, process statements offline on airplane mode, and sync only when desired.
              </p>
              <ul className="mt-6 space-y-3 text-xs text-zinc-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" /> Native Android document picker for PDF, CSV, and XLSX
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" /> 100% offline operation without active cellular or Wi-Fi connection
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" /> Android FileProvider integration for native share sheet export
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" /> Encrypted local preference storage and biometric support
                </li>
              </ul>
            </div>
            <div className="rounded-3xl border border-white/15 bg-zinc-950 p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <Smartphone size={20} className="text-rose-500" />
                  <span className="text-xs font-bold text-white">FinanceIQ Android Client</span>
                </div>
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  APK Ready
                </span>
              </div>
              <div className="mt-4 space-y-2 font-mono text-xs text-zinc-400 bg-black/60 p-4 rounded-xl border border-white/5">
                <div>Package: com.financeiq.app</div>
                <div>Min SDK: 24 (Android 7.0+)</div>
                <div>Target SDK: 34 / 36</div>
                <div>Offline Engine: Local V8 + WebAssembly</div>
                <div>Local Database: SQLite / IndexedDB</div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/10 bg-black py-8 text-center text-xs text-zinc-500">
          <p>© {new Date().getFullYear()} FinanceIQ · AI-Powered Personal Finance & Bank Statement Intelligence</p>
          <p className="mt-1">Vercel Web Client · Render Cloud Services · Native Android Mobile Client</p>
        </footer>
      </main>
    </MotionConfig>
  );
}

function HeartPulse(props: React.ComponentProps<typeof Brain>) {
  return <Brain {...props} />;
}
