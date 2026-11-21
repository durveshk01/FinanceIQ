"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { MotionConfig, useReducedMotion } from "framer-motion";
import { Capacitor } from "@capacitor/core";
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
import {
  DEFAULT_PREFERENCES,
  LocalFinanceDatabase,
  type UserPreferences,
} from "@/lib/local-storage";
import { answerLocally } from "@/lib/local-coach";
import { reportToCsv } from "@/lib/exporters";
import { clearNativeExports, downloadOrShare } from "@/lib/native-files";
import { runSpendingSimulation } from "@/lib/goal-planner";
import CloudSyncPanel from "./cloud-sync-panel";
import { GoalEditor, ManualTransactionForm } from "./finance-inputs";
import {
  insightReportSchema,
  type FinancialGoal,
  type Transaction,
} from "@/lib/schemas";

// Lazy-load the 10 interactive charts
const IncomeVsExpenseChart = dynamic(
  () => import("./finance-charts").then((m) => m.IncomeVsExpenseChart),
  { ssr: false },
);
const CategoryChart = dynamic(
  () => import("./finance-charts").then((m) => m.CategoryChart),
  { ssr: false },
);
const CashFlowChart = dynamic(
  () => import("./finance-charts").then((m) => m.CashFlowChart),
  { ssr: false },
);
const MerchantChart = dynamic(
  () => import("./finance-charts").then((m) => m.MerchantChart),
  { ssr: false },
);
const MonthlyCashFlowChart = dynamic(
  () => import("./finance-charts").then((m) => m.MonthlyCashFlowChart),
  { ssr: false },
);
const SavingsTrendChart = dynamic(
  () => import("./finance-charts").then((m) => m.SavingsTrendChart),
  { ssr: false },
);
const SubscriptionChart = dynamic(
  () => import("./finance-charts").then((m) => m.SubscriptionChart),
  { ssr: false },
);
const WeekendWeekdayChart = dynamic(
  () => import("./finance-charts").then((m) => m.WeekendWeekdayChart),
  { ssr: false },
);
const ForecastChart = dynamic(
  () => import("./finance-charts").then((m) => m.ForecastChart),
  { ssr: false },
);
const HealthHistoryChart = dynamic(
  () => import("./finance-charts").then((m) => m.HealthHistoryChart),
  { ssr: false },
);

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
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

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
  const [analysisProgress, setAnalysisProgress] = useState({
    step: "Idle",
    percentage: 0,
  });
  const [activeTab, setActiveTab] = useState<DashboardTab>("Overview");
  const [error, setError] = useState<string | null>(null);
  const [chartsReady, setChartsReady] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [isNative, setIsNative] = useState(false);
  const [pdfPassword, setPdfPassword] = useState("");

  // Privacy & Sync states
  const [preferences, setPreferences] = useState<UserPreferences>({
    ...DEFAULT_PREFERENCES,
  });

  // Transactions Ledger State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<
    "All" | "income" | "expense" | "transfer"
  >("All");
  const [sortField, setSortField] = useState<"date" | "amount">("date");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [ledgerPage, setLedgerPage] = useState(0);

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
      content:
        "Hello! I am your FinanceIQ Intelligence Coach. Upload a statement or load demo data to analyze your finances.",
      timestamp: "",
    },
  ]);

  // Export State
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);
  const dashboardRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();

  // Load saved local data on boot
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setChartsReady(true);
      setIsNative(Capacitor.isNativePlatform());
      setPreferences(LocalFinanceDatabase.getPreferences());
      let saved: InsightReport | null = null;
      try {
        saved = await LocalFinanceDatabase.getActiveReport();
      } catch (error) {
        if (!cancelled)
          setError(
            error instanceof Error
              ? error.message
              : "Could not read saved reports.",
          );
      }
      if (cancelled) return;
      if (saved) {
        setReport(saved);
        setIsDemoMode(
          saved.transactions.every(
            (transaction) => transaction.importSource === "demo-dataset",
          ),
        );
      }
      setIsRestoring(false);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = import("@capacitor/app").then(({ App }) =>
      App.addListener("backButton", ({ canGoBack }) => {
        if (activeTab !== "Overview") setActiveTab("Overview");
        else if (canGoBack) window.history.back();
        else void App.exitApp();
      }),
    );
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [activeTab]);

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
        const matchesCat =
          selectedCategory === "All" || t.category === selectedCategory;
        const matchesType =
          transactionTypeFilter === "All" || t.type === transactionTypeFilter;
        return matchesQuery && matchesCat && matchesType;
      })
      .sort((a, b) => {
        if (sortField === "date") {
          return sortOrder === "desc"
            ? b.date.localeCompare(a.date)
            : a.date.localeCompare(b.date);
        } else {
          return sortOrder === "desc"
            ? Math.abs(b.amount) - Math.abs(a.amount)
            : Math.abs(a.amount) - Math.abs(b.amount);
        }
      });
  }, [
    activeReport,
    searchQuery,
    selectedCategory,
    transactionTypeFilter,
    sortField,
    sortOrder,
  ]);

  const visibleLedgerPage = Math.min(
    ledgerPage,
    Math.max(0, Math.ceil(filteredTransactions.length / 100) - 1),
  );
  const simulationScenarios = useMemo(() => {
    if (!activeReport) return [];
    const days = Math.max(1, activeReport.period.totalDays);
    return runSpendingSimulation(
      Math.round((activeReport.totals.income / days) * 30),
      Math.round((activeReport.totals.expenses / days) * 30),
      Math.max(0, activeReport.balances.closing.amount),
      simDeltas,
    );
  }, [activeReport, simDeltas]);

  function scrollToDashboard() {
    window.setTimeout(() => {
      dashboardRef.current?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
    }, 60);
  }

  // Demo mode
  async function loadDemoData() {
    if (isRestoring || processingRef.current) return;
    const txns = demoTransactions();
    const demoRep = buildReport(txns, {
      fileNames: ["FinanceIQ_Demo_Statement.csv"],
    });
    try {
      await LocalFinanceDatabase.saveActiveReport(demoRep);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save demo data on this device.",
      );
      return;
    }
    setReport(demoRep);
    setIsDemoMode(true);
    setError(null);
    setActiveTab("Overview");
    setMessages([
      {
        role: "assistant",
        content: `Demo statement loaded! Analyzed ${txns.length} transactions across 90 days. Net savings: ${formatCurrency(demoRep.totals.netSavings)} (${demoRep.totals.savingsRate}%). Health Score: ${demoRep.health.score}/100. Ask me any financial question!`,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ]);
    scrollToDashboard();
  }

  // Core statement processing
  async function handleFileProcess(selectedFiles: File[]) {
    if (selectedFiles.length === 0 || processingRef.current || isRestoring)
      return;
    processingRef.current = true;
    setIsAnalyzing(true);
    setError(null);
    setAnalysisProgress({
      step: "Initializing device parser...",
      percentage: 5,
    });

    try {
      if (
        preferences.localOnlyMode ||
        Capacitor.isNativePlatform() ||
        process.env.NEXT_PUBLIC_STATIC_EXPORT === "true"
      ) {
        // 100% on-device processing via device CPU & RAM
        const result = await DeviceStatementProcessor.processFilesLocally(
          selectedFiles,
          (step, pct) => {
            setAnalysisProgress({ step, percentage: pct });
          },
          { pdfPassword: pdfPassword || undefined },
        );
        setReport(result.report);
        setIsDemoMode(false);
        setActiveTab("Overview");
        setMessages([
          {
            role: "assistant",
            content: `Device processing complete! Analyzed ${result.transactions.length} transactions directly on your device. Financial Health Score: ${result.report.health.score}/100 (${result.report.health.label}).`,
            timestamp: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ]);
        scrollToDashboard();
      } else {
        // Server assisted processing fallback
        setAnalysisProgress({
          step: "Transmitting securely to cloud parser...",
          percentage: 30,
        });
        const form = new FormData();
        selectedFiles.forEach((f) => form.append("files", f));
        if (pdfPassword) form.append("pdfPassword", pdfPassword);
        const res = await fetch("/api/analyze", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok || !data.report) {
          throw new Error(
            data.error?.message || "Failed to parse bank statement.",
          );
        }
        const savedGoals = report?.goals ?? LocalFinanceDatabase.getGoals();
        const parsedReport = insightReportSchema.parse({
          ...data.report,
          ...(report || savedGoals.length ? { goals: savedGoals } : {}),
        });
        await LocalFinanceDatabase.saveActiveReport(parsedReport);
        setReport(parsedReport);
        setIsDemoMode(false);
        setActiveTab("Overview");
        scrollToDashboard();
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Could not extract transactions from file. Please ensure file contains valid bank transactions.";
      setError(msg);
    } finally {
      setIsAnalyzing(false);
      processingRef.current = false;
      setPdfPassword("");
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
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setQuestion("");
    setIsChatting(true);

    try {
      let answer = answerLocally(q, activeReport);
      if (
        !preferences.localOnlyMode &&
        preferences.allowAiSharing &&
        !Capacitor.isNativePlatform() &&
        process.env.NEXT_PUBLIC_STATIC_EXPORT !== "true" &&
        navigator.onLine
      ) {
        try {
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question: q,
              report: activeReport,
              allowAiSharing: preferences.allowAiSharing,
            }),
            signal: AbortSignal.timeout(25000),
          });
          if (res.ok) {
            const data = await res.json();
            if (typeof data.answer === "string" && data.answer.trim())
              answer = data.answer;
          }
        } catch {
          // The on-device answer remains available during network outages.
        }
      }
      const botMsg: ChatMessage = {
        role: "assistant",
        content: answer,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry, I encountered a temporary connection issue. Please try again.",
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
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
        setExportFeedback(
          await downloadOrShare(
            new Blob([reportToCsv(activeReport)], {
              type: "text/csv;charset=utf-8;",
            }),
            "FinanceIQ_Statement_Report.csv",
          ),
        );
      } else if (format === "json") {
        const json = JSON.stringify(activeReport, null, 2);
        setExportFeedback(
          await downloadOrShare(
            new Blob([json], { type: "application/json" }),
            "FinanceIQ_Report_Backup.json",
          ),
        );
      } else {
        const exporters = await import("@/lib/exporters");
        const bytes =
          format === "pdf"
            ? await exporters.reportToPdf(activeReport)
            : await exporters.reportToXlsx(activeReport);
        const blob = new Blob([new Uint8Array(bytes as ArrayBuffer)], {
          type:
            format === "pdf"
              ? "application/pdf"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        setExportFeedback(
          await downloadOrShare(
            blob,
            format === "pdf"
              ? "FinanceIQ_Health_Report.pdf"
              : "FinanceIQ_Statement.xlsx",
          ),
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setExportFeedback(`Export failed: ${msg}`);
    } finally {
      setExporting(null);
    }
  }

  async function exportBackup() {
    try {
      const backup = await LocalFinanceDatabase.exportFullBackup(
        activeReport ?? undefined,
      );
      setExportFeedback(
        await downloadOrShare(
          new Blob([backup], { type: "application/json" }),
          "FinanceIQ_Local_Backup.json",
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not export the local backup.",
      );
    }
  }

  async function restoreBackup(file: File) {
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("The backup exceeds the 20 MB limit.");
      if (!(await LocalFinanceDatabase.importFullBackup(await file.text())))
        throw new Error("This file is not a valid FinanceIQ JSON backup.");
      const restored = await LocalFinanceDatabase.getActiveReport();
      setReport(restored);
      setPreferences(LocalFinanceDatabase.getPreferences());
      setIsDemoMode(
        Boolean(
          restored?.transactions.length &&
          restored.transactions.every(
            (transaction) => transaction.importSource === "demo-dataset",
          ),
        ),
      );
      setError(null);
      setExportFeedback("FinanceIQ backup restored successfully.");
      setActiveTab("Overview");
      scrollToDashboard();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not restore the backup.",
      );
    }
  }

  async function clearLocalData() {
    if (
      !confirm(
        "Are you sure you want to permanently erase all local bank statements and financial reports?",
      )
    )
      return;
    try {
      await clearNativeExports();
      await LocalFinanceDatabase.clearAllData();
      setReport(null);
      setPreferences(LocalFinanceDatabase.getPreferences());
      setIsDemoMode(false);
      setActiveTab("Overview");
      setExportFeedback(null);
      setError(null);
      setMessages([
        {
          role: "assistant",
          content:
            "Local data cleared. Import a statement or load demo data to start again.",
          timestamp: "",
        },
      ]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not clear device storage.",
      );
    }
  }

  // Exclude or Include Transaction live
  async function saveGoals(goals: FinancialGoal[]) {
    if (!activeReport) return;
    const updated = insightReportSchema.parse({
      ...activeReport,
      goals,
      generatedAt: new Date(
        Math.max(Date.now(), Date.parse(activeReport.generatedAt) + 1),
      ).toISOString(),
    });
    await LocalFinanceDatabase.saveActiveReport(updated);
    setReport(updated);
  }

  async function addManualTransaction(transaction: Transaction) {
    if (!activeReport) return;
    const updated = buildReport([...activeReport.transactions, transaction], {
      fileNames: activeReport.importSummary?.fileNames,
      goals: activeReport.goals,
      openingBalance:
        activeReport.balances.opening.source === "observed"
          ? activeReport.balances.opening.amount
          : undefined,
    });
    await LocalFinanceDatabase.saveActiveReport(updated);
    setReport(updated);
  }

  function updatePreferences(updates: Partial<UserPreferences>) {
    try {
      setPreferences(LocalFinanceDatabase.savePreferences(updates));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save privacy settings.",
      );
    }
  }

  async function toggleTransactionExcluded(txnId: string) {
    if (!activeReport) return;
    const updated = activeReport.transactions.map((t) =>
      t.id === txnId ? { ...t, isExcluded: !t.isExcluded } : t,
    );
    const recomputed = buildReport(updated, {
      fileNames: activeReport.importSummary?.fileNames,
      goals: activeReport.goals,
      duplicatesRemoved: activeReport.importSummary?.duplicatesRemoved,
      openingBalance:
        activeReport.balances.opening.source === "observed"
          ? activeReport.balances.opening.amount
          : undefined,
      closingBalance:
        activeReport.balances.closing.source === "observed"
          ? activeReport.balances.closing.amount
          : undefined,
    });
    try {
      await LocalFinanceDatabase.saveActiveReport(recomputed);
      setReport(recomputed);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save the transaction change.",
      );
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <main className="min-h-screen bg-black text-white selection:bg-rose-600 selection:text-white">
        {error && (
          <div
            role="alert"
            className="fixed bottom-4 left-4 right-4 z-[60] mx-auto flex max-w-xl items-center gap-3 rounded-xl border border-red-500/40 bg-red-950 p-4 text-xs text-red-200"
          >
            <AlertTriangle size={18} />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              Dismiss
            </button>
          </div>
        )}
        {!activeReport && exportFeedback && !error && (
          <div
            role="status"
            className="fixed bottom-4 left-4 right-4 z-[60] mx-auto flex max-w-xl items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-950 p-4 text-xs text-emerald-300"
          >
            <span className="flex-1">{exportFeedback}</span>
            <button
              type="button"
              onClick={() => setExportFeedback(null)}
              aria-label="Dismiss notification"
            >
              Dismiss
            </button>
          </div>
        )}
        {/* Top Enterprise Navigation */}
        <header className="sticky top-0 z-50 border-b border-white/10 bg-black/85 backdrop-blur-2xl">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-600 to-red-700 shadow-[0_0_25px_rgba(229,9,20,0.45)]">
                <Landmark size={20} className="text-white" />
              </div>
              <div>
                <span className="text-xl font-black tracking-tight text-white">
                  FinanceIQ
                </span>
                <span className="ml-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-400">
                  Device AI
                </span>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-400">
              <a
                href="#features"
                className="hover:text-white transition-colors"
              >
                Capabilities
              </a>
              <a
                href="#dashboard"
                className="hover:text-white transition-colors"
              >
                Command Center
              </a>
              <a
                href="#security"
                className="hover:text-white transition-colors"
              >
                Privacy & Security
              </a>
              <a href="#mobile" className="hover:text-white transition-colors">
                Android Native
              </a>
            </nav>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={loadDemoData}
                disabled={isRestoring || isAnalyzing}
                className="hidden sm:inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-bold text-white hover:border-white/30 hover:bg-white/10 transition-all"
              >
                <FileSpreadsheet size={15} /> Demo Data
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isAnalyzing || isRestoring}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2 text-xs font-extrabold text-white shadow-[0_0_25px_rgba(229,9,20,0.4)] hover:brightness-110 transition-all"
              >
                <UploadCloud size={16} />{" "}
                {isAnalyzing ? "Processing..." : "Import Statement"}
              </button>
            </div>
          </div>
        </header>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          aria-label="Import bank statements"
          accept=".pdf,.csv,.xlsx,.txt,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              const filesArr = Array.from(e.target.files);
              handleFileProcess(filesArr);
            }
            e.target.value = "";
          }}
        />
        <input
          ref={backupInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label="Restore FinanceIQ backup"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void restoreBackup(file);
            event.target.value = "";
          }}
        />

        {/* Hero Section */}
        <section className="relative overflow-hidden px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(229,9,20,0.25),rgba(255,255,255,0))]" />
          <div className="relative mx-auto max-w-5xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-4 py-1.5 text-xs font-semibold text-rose-300">
              <ShieldCheck size={15} /> 100% On-Device Processing · Zero Cloud
              Upload By Default
            </div>
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl">
              Financial Intelligence Powered by Your Device.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400 sm:text-xl">
              Extract transactions, detect multi-cadence subscriptions, score
              your financial resilience, and forecast future balances directly
              on your CPU and RAM.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isAnalyzing || isRestoring}
                className="inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-6 py-3.5 text-sm font-black text-white shadow-[0_0_35px_rgba(229,9,20,0.5)] hover:scale-105 transition-all"
              >
                <UploadCloud size={18} />{" "}
                {isAnalyzing ? "Processing..." : "Import Bank Statement"}
              </button>
              <button
                type="button"
                onClick={loadDemoData}
                disabled={isRestoring || isAnalyzing}
                className="inline-flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-bold text-white hover:border-white/30 hover:bg-white/10 transition-all"
              >
                <Play size={16} /> Explore Verified Demo
              </button>
            </div>

            <label className="mx-auto mt-4 flex max-w-sm flex-col gap-1 text-left text-xs text-zinc-400">
              PDF password (only for encrypted statements)
              <input
                type="password"
                value={pdfPassword}
                onChange={(event) => setPdfPassword(event.target.value)}
                autoComplete="off"
                disabled={isAnalyzing}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
                placeholder="Optional for encrypted PDFs"
              />
            </label>

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

            {/* Supported Banks Strip */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-3 text-xs text-zinc-400">
              <span className="font-semibold text-zinc-300">
                Supported Formats & Profiles:
              </span>
              <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1">
                HDFC Bank
              </span>
              <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1">
                SBI
              </span>
              <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1">
                ICICI Bank
              </span>
              <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1">
                Axis Bank
              </span>
              <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1">
                Kotak
              </span>
              <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1">
                Chase & BOA
              </span>
              <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1">
                Revolut & Monzo
              </span>
              <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1">
                PDF · CSV · XLSX
              </span>
            </div>
          </div>
        </section>

        {/* Financial Command Center / Dashboard */}
        <section
          id="dashboard"
          ref={dashboardRef}
          className="mx-auto max-w-7xl px-4 py-8 sm:px-6"
        >
          {!activeReport ? (
            <div className="rounded-3xl border border-dashed border-white/15 bg-zinc-950/40 p-12 text-center backdrop-blur-xl">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                <WalletCards size={28} className="text-rose-500" />
              </div>
              <h3 className="mt-4 text-xl font-extrabold text-white">
                {isRestoring
                  ? "Restoring Device Data..."
                  : "No Statement Loaded"}
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
                Import your bank statement PDF, CSV, or Excel spreadsheet to
                generate your financial health score and intelligence report.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isRestoring || isAnalyzing}
                  className="rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-rose-500 transition-all"
                >
                  Import File
                </button>
                <button
                  type="button"
                  onClick={loadDemoData}
                  disabled={isRestoring || isAnalyzing}
                  className="rounded-xl border border-white/20 bg-white/5 px-5 py-2.5 text-xs font-bold text-white hover:bg-white/10 transition-all"
                >
                  Load Demo Data
                </button>
              </div>
              <button
                type="button"
                onClick={() => backupInputRef.current?.click()}
                disabled={isRestoring}
                className="mt-4 text-xs text-zinc-300 underline"
              >
                Restore a JSON Backup
              </button>
              <div className="mt-6 text-left">
                <CloudSyncPanel
                  report={null}
                  preferences={preferences}
                  onPreferences={setPreferences}
                  onReport={setReport}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Command Center Control Bar */}
              <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-zinc-950/80 p-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-black text-white">
                      Financial Command Center
                    </h2>
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
                    Period: {activeReport.period.startDate} to{" "}
                    {activeReport.period.endDate} (
                    {activeReport.period.totalDays} days) ·{" "}
                    {activeReport.totals.totalTransactions} transactions
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

              {exportFeedback && (
                <div
                  role="status"
                  className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3 text-xs text-emerald-300"
                >
                  {exportFeedback}
                </div>
              )}

              {/* KPI Ribbons */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                  <span className="text-[11px] font-semibold text-zinc-400">
                    Total Income
                  </span>
                  <div className="mt-1 text-lg font-black text-emerald-400">
                    {formatCurrency(activeReport.totals.income)}
                  </div>
                  <span className="text-[10px] text-zinc-400">
                    Verified deposits
                  </span>
                </div>
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                  <span className="text-[11px] font-semibold text-zinc-400">
                    Total Expenses
                  </span>
                  <div className="mt-1 text-lg font-black text-rose-500">
                    {formatCurrency(activeReport.totals.expenses)}
                  </div>
                  <span className="text-[10px] text-zinc-400">
                    Outflows detected
                  </span>
                </div>
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                  <span className="text-[11px] font-semibold text-zinc-400">
                    Net Savings
                  </span>
                  <div className="mt-1 text-lg font-black text-blue-400">
                    {formatCurrency(activeReport.totals.netSavings)}
                  </div>
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-400">
                    <TrendingUp size={10} /> {activeReport.totals.savingsRate}%
                    rate
                  </span>
                </div>
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                  <span className="text-[11px] font-semibold text-zinc-400">
                    Health Score
                  </span>
                  <div className="mt-1 text-lg font-black text-emerald-400">
                    {activeReport.health.score}/100
                  </div>
                  <span className="text-[10px] font-semibold text-zinc-300">
                    {activeReport.health.label}
                  </span>
                </div>
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                  <span className="text-[11px] font-semibold text-zinc-400">
                    Closing Balance
                  </span>
                  <div className="mt-1 text-lg font-black text-white">
                    {formatCurrency(activeReport.balances.closing.amount)}
                  </div>
                  <span className="text-[10px] text-zinc-400 capitalize">
                    {activeReport.balances.closing.source} balance
                  </span>
                </div>
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                  <span className="text-[11px] font-semibold text-zinc-400">
                    Subscriptions
                  </span>
                  <div className="mt-1 text-lg font-black text-amber-400">
                    {formatCurrency(
                      activeReport.subscriptions.reduce(
                        (a, s) => a + s.monthlyCost,
                        0,
                      ),
                    )}
                    /mo
                  </div>
                  <span className="text-[10px] text-zinc-400">
                    {activeReport.subscriptions.length} recurring
                  </span>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div
                role="tablist"
                aria-label="Financial dashboard"
                className="flex border-b border-white/10 overflow-x-auto scrollbar-none gap-2"
              >
                {dashboardTabs.map((tab) => (
                  <button
                    key={tab}
                    role="tab"
                    aria-selected={activeTab === tab}
                    id={`tab-${dashboardTabs.indexOf(tab)}`}
                    aria-controls="dashboard-panel"
                    tabIndex={activeTab === tab ? 0 : -1}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    onKeyDown={(event) => {
                      const index = dashboardTabs.indexOf(tab);
                      const next =
                        event.key === "ArrowRight"
                          ? (index + 1) % dashboardTabs.length
                          : event.key === "ArrowLeft"
                            ? (index + dashboardTabs.length - 1) %
                              dashboardTabs.length
                            : event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? dashboardTabs.length - 1
                                : -1;
                      if (next >= 0) {
                        event.preventDefault();
                        setActiveTab(dashboardTabs[next]);
                        document.getElementById(`tab-${next}`)?.focus();
                      }
                    }}
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

              <div
                id="dashboard-panel"
                role="tabpanel"
                aria-labelledby={`tab-${dashboardTabs.indexOf(activeTab)}`}
                tabIndex={0}
              >
                {/* TAB 1: OVERVIEW */}
                {activeTab === "Overview" && (
                  <div className="space-y-6">
                    {/* Balance Verification Card */}
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-zinc-400">
                            Opening Balance
                          </span>
                          <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] capitalize text-zinc-300">
                            {activeReport.balances.opening.source}
                          </span>
                        </div>
                        <div className="mt-2 text-2xl font-black text-white">
                          {formatCurrency(activeReport.balances.opening.amount)}
                        </div>
                        <p className="mt-1 text-xs text-zinc-400">
                          {activeReport.balances.opening.note}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-zinc-400">
                            Observed Closing
                          </span>
                          <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] capitalize text-emerald-300">
                            {activeReport.balances.closing.source}
                          </span>
                        </div>
                        <div className="mt-2 text-2xl font-black text-white">
                          {formatCurrency(activeReport.balances.closing.amount)}
                        </div>
                        <p className="mt-1 text-xs text-zinc-400">
                          {activeReport.balances.closing.note}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-zinc-400">
                            Calculated Cash Delta
                          </span>
                          <span className="rounded bg-blue-500/20 px-2 py-0.5 text-[10px] text-blue-300">
                            Reconciled
                          </span>
                        </div>
                        <div className="mt-2 text-2xl font-black text-blue-400">
                          {formatCurrency(activeReport.totals.netSavings)}
                        </div>
                        <p className="mt-1 text-xs text-zinc-400">
                          Income minus expenses; excludes internal transfers.
                          Account closing balance includes all bank movements.
                        </p>
                      </div>
                    </div>

                    {/* Primary Visualizations */}
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                        <div className="mb-4 flex items-center justify-between">
                          <h3 className="text-sm font-bold text-white">
                            Income vs Expenses Overview
                          </h3>
                          <span className="text-xs text-zinc-400">
                            Total Period Outlay
                          </span>
                        </div>
                        <IncomeVsExpenseChart
                          report={activeReport}
                          chartsReady={chartsReady}
                          formatMoney={formatCurrency}
                        />
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                        <div className="mb-4 flex items-center justify-between">
                          <h3 className="text-sm font-bold text-white">
                            Spending by Category
                          </h3>
                          <span className="text-xs text-zinc-400">
                            18-Pillar Allocation
                          </span>
                        </div>
                        <CategoryChart
                          report={activeReport}
                          chartsReady={chartsReady}
                          formatMoney={formatCurrency}
                        />
                      </div>
                    </div>

                    {/* Health Breakdown & Alerts */}
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                      {/* Financial Health Score Pillars */}
                      <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-sm font-bold text-white">
                            Explainable Financial Health Score
                          </h3>
                          <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-400">
                            {activeReport.health.score}/100 ·{" "}
                            {activeReport.health.label}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 mb-4">
                          {activeReport.health.methodology}
                        </p>
                        <div className="space-y-3">
                          {activeReport.health.breakdown.map((item) => (
                            <div
                              key={item.factor}
                              className="rounded-xl border border-white/5 bg-white/[0.02] p-3"
                            >
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-zinc-200">
                                  {item.factor}
                                </span>
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
                              <p className="mt-1 text-[11px] text-zinc-400">
                                {item.description}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Risk Alerts & Recommendations */}
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                          <h3 className="text-sm font-bold text-white mb-3">
                            Priority Risk Signals & Alerts
                          </h3>
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
                                <div className="mt-0.5 text-[11px] opacity-80">
                                  {alert.detail}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                          <h3 className="text-sm font-bold text-white mb-3">
                            Actionable Financial Opportunities
                          </h3>
                          <div className="space-y-2.5">
                            {activeReport.opportunities.map((opp, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs"
                              >
                                <div>
                                  <div className="font-bold text-zinc-200">
                                    {opp.title}
                                  </div>
                                  <div className="text-[11px] text-zinc-400">
                                    {opp.detail}
                                  </div>
                                </div>
                                <div className="text-right shrink-0 ml-3">
                                  <div className="text-xs font-black text-emerald-400">
                                    +{formatCurrency(opp.yearlySavings)}/yr
                                  </div>
                                  <div className="text-[10px] text-zinc-400">
                                    Projected savings
                                  </div>
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
                        <h3 className="text-sm font-bold text-white mb-2">
                          1. Daily Spending Outflow Area
                        </h3>
                        <CashFlowChart
                          report={activeReport}
                          chartsReady={chartsReady}
                          formatMoney={formatCurrency}
                        />
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                        <h3 className="text-sm font-bold text-white mb-2">
                          2. Category-Wise Distribution
                        </h3>
                        <CategoryChart
                          report={activeReport}
                          chartsReady={chartsReady}
                          formatMoney={formatCurrency}
                        />
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                        <h3 className="text-sm font-bold text-white mb-2">
                          3. Top Merchant Outflows
                        </h3>
                        <MerchantChart
                          report={activeReport}
                          chartsReady={chartsReady}
                          formatMoney={formatCurrency}
                        />
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                        <h3 className="text-sm font-bold text-white mb-2">
                          4. Weekly Outflow Rhythm
                        </h3>
                        <MonthlyCashFlowChart
                          report={activeReport}
                          chartsReady={chartsReady}
                          formatMoney={formatCurrency}
                        />
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                        <h3 className="text-sm font-bold text-white mb-2">
                          5. Savings Trajectory (+90 Days)
                        </h3>
                        <SavingsTrendChart
                          report={activeReport}
                          chartsReady={chartsReady}
                          formatMoney={formatCurrency}
                        />
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                        <h3 className="text-sm font-bold text-white mb-2">
                          6. Subscription Annual Run Rates
                        </h3>
                        <SubscriptionChart
                          report={activeReport}
                          chartsReady={chartsReady}
                          formatMoney={formatCurrency}
                        />
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                        <h3 className="text-sm font-bold text-white mb-2">
                          7. Weekend vs Weekday Spend
                        </h3>
                        <WeekendWeekdayChart
                          report={activeReport}
                          chartsReady={chartsReady}
                          formatMoney={formatCurrency}
                        />
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
                        <h3 className="text-sm font-bold text-white mb-2">
                          8. Next Month Financial Forecast
                        </h3>
                        <ForecastChart
                          report={activeReport}
                          chartsReady={chartsReady}
                          formatMoney={formatCurrency}
                        />
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5 lg:col-span-2">
                        <h3 className="text-sm font-bold text-white mb-2">
                          9. Health Factor Resiliency Breakdown
                        </h3>
                        <HealthHistoryChart
                          report={activeReport}
                          chartsReady={chartsReady}
                          formatMoney={formatCurrency}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: TRANSACTIONS LEDGER */}
                {activeTab === "Transactions" && (
                  <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5 space-y-4">
                    <ManualTransactionForm onSave={addManualTransaction} />
                    {/* Filters Bar */}
                    <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                      <div className="relative flex-1">
                        <Search
                          size={16}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                        />
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
                        {(
                          ["All", "income", "expense", "transfer"] as const
                        ).map((t) => (
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
                              setSortOrder(
                                sortOrder === "desc" ? "asc" : "desc",
                              );
                            }
                          }}
                          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 hover:bg-white/10"
                        >
                          Sort:{" "}
                          {sortField === "date"
                            ? `Date (${sortOrder.toUpperCase()})`
                            : `Amount (${sortOrder.toUpperCase()})`}
                        </button>
                      </div>
                    </div>

                    {/* Transactions Table */}
                    <div className="overflow-x-auto rounded-xl border border-white/10">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-white/5 text-zinc-400 border-b border-white/10">
                          <tr>
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3">
                              Merchant / Narration
                            </th>
                            <th className="py-2.5 px-3">Category</th>
                            <th className="py-2.5 px-3">Type</th>
                            <th className="py-2.5 px-3 text-right">Amount</th>
                            <th className="py-2.5 px-3 text-right">Balance</th>
                            <th className="py-2.5 px-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {filteredTransactions
                            .slice(
                              visibleLedgerPage * 100,
                              (visibleLedgerPage + 1) * 100,
                            )
                            .map((t) => (
                              <tr
                                key={t.id}
                                className={`hover:bg-white/[0.02] ${t.isExcluded ? "opacity-40" : ""}`}
                              >
                                <td className="py-2.5 px-3 font-mono text-zinc-400">
                                  {t.date}
                                </td>
                                <td className="py-2.5 px-3 max-w-xs truncate">
                                  <span className="font-bold text-white">
                                    {t.merchant}
                                  </span>
                                  <span className="block text-[10px] text-zinc-400 truncate">
                                    {t.description}
                                  </span>
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
                                  <span
                                    className={
                                      t.amount >= 0
                                        ? "text-emerald-400"
                                        : "text-rose-400"
                                    }
                                  >
                                    {t.amount >= 0 ? "+" : ""}
                                    {formatCurrency(t.amount)}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-zinc-400">
                                  {t.runningBalance !== undefined
                                    ? formatCurrency(t.runningBalance)
                                    : "—"}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleTransactionExcluded(t.id)
                                    }
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
                    <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-zinc-400">
                      <button
                        type="button"
                        disabled={visibleLedgerPage === 0}
                        onClick={() => setLedgerPage(visibleLedgerPage - 1)}
                        className="rounded border border-white/10 px-3 py-2 disabled:opacity-40"
                      >
                        Previous
                      </button>
                      Showing{" "}
                      {filteredTransactions.length
                        ? visibleLedgerPage * 100 + 1
                        : 0}
                      –
                      {Math.min(
                        (visibleLedgerPage + 1) * 100,
                        filteredTransactions.length,
                      )}{" "}
                      of {filteredTransactions.length} matching transactions
                      <button
                        type="button"
                        disabled={
                          (visibleLedgerPage + 1) * 100 >=
                          filteredTransactions.length
                        }
                        onClick={() => setLedgerPage(visibleLedgerPage + 1)}
                        className="rounded border border-white/10 px-3 py-2 disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}

                {/* TAB 4: SUBSCRIPTIONS */}
                {activeTab === "Subscriptions" && (
                  <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-white">
                          Detected Recurring Subscriptions
                        </h3>
                        <p className="text-xs text-zinc-400">
                          Multi-cadence interval detection identifies recurring
                          payments and projects upcoming renewals.
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-black text-amber-400">
                          {formatCurrency(
                            activeReport.subscriptions.reduce(
                              (a, s) => a + s.annualCost,
                              0,
                            ),
                          )}
                          /yr
                        </div>
                        <span className="text-[10px] text-zinc-400">
                          Total annual run-rate
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {!activeReport.subscriptions.length && (
                        <p className="text-xs text-zinc-400">
                          No recurring subscriptions detected. Import more
                          statement history to identify payment cadences.
                        </p>
                      )}
                      {activeReport.subscriptions.map((sub) => (
                        <div
                          key={sub.id}
                          className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white text-sm">
                              {sub.merchant}
                            </span>
                            <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-300 uppercase">
                              {sub.frequency}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between text-xs">
                            <span className="text-zinc-400">
                              Billing Amount
                            </span>
                            <span className="font-bold text-white">
                              {formatCurrency(sub.amount)}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between text-xs">
                            <span className="text-zinc-400">
                              Annual Run-Rate
                            </span>
                            <span className="font-bold text-amber-400">
                              {formatCurrency(sub.annualCost)}/year
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between text-xs">
                            <span className="text-zinc-400">
                              Next Estimated Renewal
                            </span>
                            <span className="font-mono text-zinc-300">
                              {sub.nextPaymentDate}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400 pt-1 border-t border-white/5">
                            {sub.explanation}
                          </p>
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
                          <h3 className="text-sm font-bold text-white">
                            Chronological Forecasting Engine
                          </h3>
                          <p className="text-xs text-zinc-400">
                            {activeReport.forecasting.explanation}
                          </p>
                        </div>
                        <span className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-mono text-zinc-300">
                          MAE: ₹
                          {activeReport.forecasting.evaluationMetrics.mae.toLocaleString()}{" "}
                          · RMSE: ₹
                          {activeReport.forecasting.evaluationMetrics.rmse.toLocaleString()}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                          <span className="text-[11px] text-zinc-400 font-medium">
                            Projected Next Month Spend
                          </span>
                          <div className="mt-1 text-xl font-black text-amber-400">
                            {formatCurrency(
                              activeReport.forecasting.nextMonthExpenses,
                            )}
                          </div>
                          <span className="text-[10px] text-zinc-400">
                            Range:{" "}
                            {formatCurrency(
                              activeReport.forecasting.confidenceInterval.lower,
                            )}{" "}
                            -{" "}
                            {formatCurrency(
                              activeReport.forecasting.confidenceInterval.upper,
                            )}
                          </span>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                          <span className="text-[11px] text-zinc-400 font-medium">
                            Projected Next Month Savings
                          </span>
                          <div className="mt-1 text-xl font-black text-emerald-400">
                            {formatCurrency(
                              activeReport.forecasting.nextMonthSavings,
                            )}
                          </div>
                          <span className="text-[10px] text-zinc-400">
                            Estimated surplus cushion
                          </span>
                        </div>
                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                          <span className="text-[11px] text-zinc-400 font-medium">
                            Estimated 90-Day Balance
                          </span>
                          <div className="mt-1 text-xl font-black text-blue-400">
                            {formatCurrency(
                              activeReport.forecasting.futureBalance90Days,
                            )}
                          </div>
                          <span className="text-[10px] text-zinc-400">
                            Current closing + 3mo run-rate
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Goal Planner */}
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5 space-y-4">
                      <h3 className="text-sm font-bold text-white">
                        Financial Goal Planner
                      </h3>
                      <GoalEditor report={activeReport} onSave={saveGoals} />
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        {activeReport.goals.map((g) => {
                          const pct = Math.min(
                            100,
                            Math.round(
                              (g.currentAmount / g.targetAmount) * 100,
                            ),
                          );
                          return (
                            <div
                              key={g.id}
                              className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-white text-xs">
                                  {g.title}
                                </span>
                                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                                  {pct}%
                                </span>
                              </div>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                                <div
                                  className="h-full bg-emerald-500 rounded-full"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-[11px] text-zinc-400">
                                <span>
                                  Saved: {formatCurrency(g.currentAmount)}
                                </span>
                                <span>
                                  Target: {formatCurrency(g.targetAmount)}
                                </span>
                              </div>
                              <div className="text-[10px] text-zinc-400 pt-1 border-t border-white/5">
                                Monthly need:{" "}
                                {formatCurrency(g.monthlyContribution)}/mo ·
                                Completion: {g.projectedCompletionDate}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Spending What-If Simulator */}
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5 space-y-4">
                      <h3 className="text-sm font-bold text-white">
                        Interactive Spending & Outflow Simulator
                      </h3>
                      <p className="text-xs text-zinc-400">
                        Simulate modifications to your monthly income, rent,
                        food, or subscriptions to inspect resilience impact.
                      </p>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                        <div>
                          <label
                            htmlFor="food-adjust"
                            className="text-[11px] text-zinc-400"
                          >
                            Dining/Food Adjust (₹)
                          </label>
                          <input
                            id="food-adjust"
                            type="range"
                            min="-10000"
                            max="10000"
                            step="500"
                            value={simDeltas.foodDelta}
                            onChange={(e) =>
                              setSimDeltas({
                                ...simDeltas,
                                foodDelta: Number(e.target.value),
                              })
                            }
                            className="w-full accent-rose-500"
                          />
                          <span className="text-xs font-mono">
                            {formatCurrency(simDeltas.foodDelta)}
                          </span>
                        </div>
                        <div>
                          <label
                            htmlFor="shopping-adjust"
                            className="text-[11px] text-zinc-400"
                          >
                            Shopping Adjust (₹)
                          </label>
                          <input
                            id="shopping-adjust"
                            type="range"
                            min="-15000"
                            max="15000"
                            step="500"
                            value={simDeltas.shoppingDelta}
                            onChange={(e) =>
                              setSimDeltas({
                                ...simDeltas,
                                shoppingDelta: Number(e.target.value),
                              })
                            }
                            className="w-full accent-rose-500"
                          />
                          <span className="text-xs font-mono">
                            {formatCurrency(simDeltas.shoppingDelta)}
                          </span>
                        </div>
                        <div>
                          <label
                            htmlFor="income-adjust"
                            className="text-[11px] text-zinc-400"
                          >
                            Income Delta (₹)
                          </label>
                          <input
                            id="income-adjust"
                            type="range"
                            min="-20000"
                            max="50000"
                            step="1000"
                            value={simDeltas.incomeDelta}
                            onChange={(e) =>
                              setSimDeltas({
                                ...simDeltas,
                                incomeDelta: Number(e.target.value),
                              })
                            }
                            className="w-full accent-rose-500"
                          />
                          <span className="text-xs font-mono">
                            {formatCurrency(simDeltas.incomeDelta)}
                          </span>
                        </div>
                        <div>
                          <label
                            htmlFor="shock-adjust"
                            className="text-[11px] text-zinc-400"
                          >
                            Unexpected Shock (₹)
                          </label>
                          <input
                            id="shock-adjust"
                            type="range"
                            min="0"
                            max="50000"
                            step="2000"
                            value={simDeltas.unexpectedExpense}
                            onChange={(e) =>
                              setSimDeltas({
                                ...simDeltas,
                                unexpectedExpense: Number(e.target.value),
                              })
                            }
                            className="w-full accent-rose-500"
                          />
                          <span className="text-xs font-mono">
                            {formatCurrency(simDeltas.unexpectedExpense)}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 pt-2">
                        {simulationScenarios.map((s) => (
                          <div
                            key={s.scenarioName}
                            className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs space-y-1"
                          >
                            <div className="font-bold text-white">
                              {s.scenarioName}
                            </div>
                            <div className="flex justify-between text-zinc-400">
                              <span>Savings:</span>
                              <span className="font-bold text-emerald-400">
                                {formatCurrency(s.netSavings)}
                              </span>
                            </div>
                            <div className="flex justify-between text-zinc-400">
                              <span>Savings Rate:</span>
                              <span className="font-bold text-white">
                                {s.savingsRate}%
                              </span>
                            </div>
                            <div className="flex justify-between text-zinc-400">
                              <span>Emergency Runway:</span>
                              <span className="font-bold text-blue-400">
                                {s.emergencyRunwayMonths} months
                              </span>
                            </div>
                            <p className="text-[10px] text-zinc-400 pt-1">
                              {s.summary}
                            </p>
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
                        <h3 className="text-sm font-bold text-white">
                          FinanceIQ AI Intelligence Coach
                        </h3>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                        <input
                          type="checkbox"
                          disabled={
                            isNative ||
                            process.env.NEXT_PUBLIC_STATIC_EXPORT === "true"
                          }
                          checked={preferences.allowAiSharing}
                          onChange={(e) => {
                            updatePreferences({
                              allowAiSharing: e.target.checked,
                              ...(e.target.checked
                                ? { localOnlyMode: false }
                                : {}),
                            });
                          }}
                          className="accent-rose-600 rounded"
                        />
                        <span>
                          {isNative ||
                          process.env.NEXT_PUBLIC_STATIC_EXPORT === "true"
                            ? "Offline on-device coach"
                            : "Allow OpenAI (shares question, amounts, merchants and goals; disables local-only mode)"}
                        </span>
                      </label>
                    </div>

                    {/* Chat messages box */}
                    <div className="h-80 overflow-y-auto space-y-3 p-3 rounded-xl border border-white/5 bg-black/40">
                      {messages.map((m, i) => (
                        <div
                          key={i}
                          className={`flex flex-col ${
                            m.role === "user"
                              ? "items-end text-right"
                              : "items-start text-left"
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
                          <span className="text-[9px] text-zinc-400 mt-0.5 px-1">
                            {m.timestamp}
                          </span>
                        </div>
                      ))}
                      {isChatting && (
                        <div className="flex items-center gap-2 text-xs text-zinc-400">
                          <RefreshCw size={14} className="animate-spin" />{" "}
                          Thinking...
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
                      <h3 className="text-sm font-bold text-white">
                        Local-First Privacy Controls & Cloud Synchronization
                      </h3>
                      <p className="text-xs text-zinc-400">
                        Manage your offline storage, data backups, and optional
                        HTTPS synchronization to your backend.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {/* Device Local Database */}
                      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <Database size={18} className="text-emerald-400" />
                          <h4 className="text-xs font-bold text-white">
                            Private Device Storage (IndexedDB)
                          </h4>
                        </div>
                        <p className="text-xs text-zinc-400">
                          Financial data is stored privately on your device.
                          Clearing data permanently deletes local caches.
                        </p>
                        <label className="flex items-start gap-2 text-xs text-zinc-300">
                          <input
                            type="checkbox"
                            checked={preferences.localOnlyMode}
                            onChange={(event) =>
                              updatePreferences({
                                localOnlyMode: event.target.checked,
                                ...(event.target.checked
                                  ? {
                                      cloudSyncOptIn: false,
                                      allowAiSharing: false,
                                    }
                                  : {}),
                              })
                            }
                            className="accent-emerald-500"
                          />
                          Local-only mode: process statements and answer
                          questions on this device. Disable to allow
                          server-assisted web parsing; cloud uploads and OpenAI
                          still need separate consent.
                        </label>
                        <div className="flex flex-wrap gap-2 pt-2">
                          <button
                            type="button"
                            onClick={exportBackup}
                            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10"
                          >
                            Export Full Backup (JSON)
                          </button>
                          <button
                            type="button"
                            onClick={() => backupInputRef.current?.click()}
                            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white"
                          >
                            Restore JSON Backup
                          </button>
                          <button
                            type="button"
                            onClick={clearLocalData}
                            className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-900/50"
                          >
                            Clear Local Data
                          </button>
                        </div>
                      </div>

                      {/* Render Cloud Sync */}
                      <CloudSyncPanel
                        report={activeReport}
                        preferences={preferences}
                        onPreferences={setPreferences}
                        onReport={(nextReport) => {
                          setReport(nextReport);
                          setIsDemoMode(false);
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* TAB 8: EXPORTS */}
                {activeTab === "Exports" && (
                  <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5 space-y-4">
                    <h3 className="text-sm font-bold text-white">
                      Local Financial Report Generation
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Export high-fidelity reports directly from verified memory
                      in multiple standard formats.
                    </p>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <button
                        type="button"
                        onClick={() => exportReport("csv")}
                        disabled={exporting !== null}
                        className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left hover:border-white/20 hover:bg-white/[0.04] transition-all"
                      >
                        <FileSpreadsheet
                          size={24}
                          className="text-emerald-400"
                        />
                        <div className="mt-2 font-bold text-white text-xs">
                          CSV Statement Ledger
                        </div>
                        <p className="text-[10px] text-zinc-400 mt-1">
                          Formula-sanitized CSV with normalized columns
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => exportReport("xlsx")}
                        disabled={exporting !== null}
                        className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left hover:border-white/20 hover:bg-white/[0.04] transition-all"
                      >
                        <FileSpreadsheet size={24} className="text-blue-400" />
                        <div className="mt-2 font-bold text-white text-xs">
                          Excel Workbook (.XLSX)
                        </div>
                        <p className="text-[10px] text-zinc-400 mt-1">
                          Formatted multi-sheet summary and ledger
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => exportReport("pdf")}
                        disabled={exporting !== null}
                        className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left hover:border-white/20 hover:bg-white/[0.04] transition-all"
                      >
                        <FileText size={24} className="text-rose-500" />
                        <div className="mt-2 font-bold text-white text-xs">
                          PDF Health Dossier
                        </div>
                        <p className="text-[10px] text-zinc-400 mt-1">
                          Executive financial summary with categories
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => exportReport("json")}
                        disabled={exporting !== null}
                        className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left hover:border-white/20 hover:bg-white/[0.04] transition-all"
                      >
                        <Database size={24} className="text-purple-400" />
                        <div className="mt-2 font-bold text-white text-xs">
                          Structured JSON Archive
                        </div>
                        <p className="text-[10px] text-zinc-400 mt-1">
                          Complete schema-validated backup archive
                        </p>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Capabilities Section */}
        <section id="features" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-xs font-bold text-rose-500 uppercase tracking-widest">
              Capabilities
            </span>
            <h2 className="mt-2 text-3xl font-black text-white sm:text-4xl">
              Engineered for Sovereign Financial Control
            </h2>
            <p className="mt-3 text-sm text-zinc-400">
              Everything needed to audit bank statements, eliminate subscription
              waste, and model financial freedom.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-6">
              <Smartphone size={24} className="text-rose-500" />
              <h3 className="mt-4 text-base font-bold text-white">
                Device-Powered Processing
              </h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Bank statements never touch a server by default. Parsing,
                categorization, health metrics, and forecasting run locally on
                your phone or browser.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-6">
              <ShieldCheck size={24} className="text-emerald-400" />
              <h3 id="security" className="mt-4 text-base font-bold text-white">
                Zero Mandatory Cloud Upload
              </h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Optional cloud sync sends your report and transactions to your
                chosen backend over HTTPS. Original statement files stay on your
                device.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-6">
              <Sparkles size={24} className="text-amber-400" />
              <h3 className="mt-4 text-base font-bold text-white">
                Multi-Cadence Subscription Radar
              </h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Detects weekly, bi-weekly, monthly, quarterly, and annual
                recurring commitments with interval variance tolerance and
                renewal projection.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-6">
              <HeartPulse size={24} className="text-blue-400" />
              <h3 className="mt-4 text-base font-bold text-white">
                6-Pillar Health Score
              </h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Explainable mathematical scoring evaluating savings rate, fixed
                burdens, debt service ratio, emergency buffer, and spending
                volatility.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-6">
              <LineChart size={24} className="text-purple-400" />
              <h3 className="mt-4 text-base font-bold text-white">
                Chronological Forecasting
              </h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Time-series forecasting with single exponential smoothing,
                chronological train/test validation, and transparent MAE/RMSE
                confidence metrics.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-6">
              <Download size={24} className="text-rose-400" />
              <h3 className="mt-4 text-base font-bold text-white">
                Local Report Exports
              </h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Generate CSV, Excel XLSX, PDF dossiers, and full JSON archives
                instantly on device without server turnaround.
              </p>
            </div>
          </div>
        </section>

        {/* Android Native Showcase */}
        <section
          id="mobile"
          className="mx-auto max-w-7xl px-4 py-16 sm:px-6 border-t border-white/10"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <span className="text-xs font-bold text-rose-500 uppercase tracking-widest">
                Mobile Client
              </span>
              <h2 className="mt-2 text-3xl font-black text-white sm:text-4xl">
                Native Android Mobile Application
              </h2>
              <p className="mt-4 text-sm text-zinc-400 leading-relaxed">
                FinanceIQ runs as an Android application built with Capacitor 8
                and native Android platform tools. Select files from internal
                device storage, process statements offline in airplane mode, and
                sync only when desired.
              </p>
              <ul className="mt-6 space-y-3 text-xs text-zinc-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" /> Native
                  Android document picker for PDF, CSV, and XLSX
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" /> 100%
                  offline operation without active cellular or Wi-Fi connection
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" />{" "}
                  Android FileProvider integration for native share sheet export
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" />{" "}
                  Private app storage with portable JSON backup and restore
                </li>
              </ul>
            </div>
            <div className="rounded-3xl border border-white/15 bg-zinc-950 p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <Smartphone size={20} className="text-rose-500" />
                  <span className="text-xs font-bold text-white">
                    FinanceIQ Android Client
                  </span>
                </div>
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  APK Ready
                </span>
              </div>
              <div className="mt-4 space-y-2 font-mono text-xs text-zinc-400 bg-black/60 p-4 rounded-xl border border-white/5">
                <div>Package: com.durvesh.financeiq</div>
                <div>Min SDK: 24 (Android 7.0+)</div>
                <div>Target SDK: 36</div>
                <div>Offline Engine: Local V8 + WebAssembly</div>
                <div>Local Database: IndexedDB</div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/10 bg-black py-8 text-center text-xs text-zinc-500">
          <p>
            © {new Date().getFullYear()} FinanceIQ · AI-Powered Personal Finance
            & Bank Statement Intelligence
          </p>
          <p className="mt-1">
            Vercel Web Client · Render Cloud Services · Native Android Mobile
            Client
          </p>
        </footer>
      </main>
    </MotionConfig>
  );
}

function HeartPulse(props: React.ComponentProps<typeof Brain>) {
  return <Brain {...props} />;
}
