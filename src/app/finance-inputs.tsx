"use client";

import { useState, type FormEvent } from "react";
import { categorizeTransaction } from "@/lib/categorizer";
import {
  financialGoalSchema,
  transactionSchema,
  type FinancialGoal,
  type InsightReport,
  type Transaction,
} from "@/lib/schemas";
import { projectGoal } from "@/lib/goal-planner";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs";

export function ManualTransactionForm({
  onSave,
}: {
  onSave: (transaction: Transaction) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setFeedback("");
    try {
      const amount = Number(data.get("amount"));
      if (!Number.isFinite(amount) || !amount)
        throw new Error(
          "Enter a non-zero amount; expenses use negative amounts.",
        );
      const description = String(data.get("description")).trim();
      const info = categorizeTransaction(description, amount);
      await onSave(
        transactionSchema.parse({
          id: `txn_${crypto.randomUUID()}`,
          date: data.get("date"),
          description,
          merchant: info.merchant,
          amount,
          debit: amount < 0 ? -amount : 0,
          credit: amount > 0 ? amount : 0,
          type:
            data.get("type") === "transfer"
              ? "transfer"
              : amount > 0
                ? "income"
                : "expense",
          category: String(data.get("category")).trim() || info.category,
          importSource: "manual",
          isReviewed: true,
        }),
      );
      form.reset();
      setFeedback("Manual transaction saved.");
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Could not save the transaction.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-xl border border-white/10 p-3">
      <summary className="cursor-pointer text-xs font-bold">
        Add Manual Transaction
      </summary>
      <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs">
          Transaction date
          <input name="date" type="date" required className={inputClass} />
        </label>
        <label className="text-xs">
          Transaction description
          <input
            name="description"
            required
            maxLength={500}
            className={inputClass}
          />
        </label>
        <label className="text-xs">
          Signed amount (₹)
          <input
            name="amount"
            type="number"
            step="0.01"
            required
            className={inputClass}
          />
        </label>
        <label className="text-xs">
          Category (optional)
          <input name="category" maxLength={100} className={inputClass} />
        </label>
        <label className="text-xs">
          Movement type
          <select name="type" className={inputClass}>
            <option value="automatic">Income / expense by sign</option>
            <option value="transfer">Internal transfer</option>
          </select>
        </label>
        <button
          disabled={busy}
          type="submit"
          className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold disabled:opacity-40"
        >
          Save Transaction
        </button>
      </form>
      {feedback && (
        <p role="status" className="mt-2 text-xs">
          {feedback}
        </p>
      )}
    </details>
  );
}

export function GoalEditor({
  report,
  onSave,
}: {
  report: InsightReport;
  onSave: (goals: FinancialGoal[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState("new");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const goal = report.goals.find((item) => item.id === selected);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      const updated = projectGoal(
        financialGoalSchema.parse({
          id: goal?.id ?? `goal_${crypto.randomUUID()}`,
          title: String(data.get("title")).trim(),
          category: goal?.category ?? "custom",
          targetAmount: Number(data.get("target")),
          currentAmount: Number(data.get("current")),
          deadline: data.get("deadline"),
          priority: goal?.priority ?? "medium",
          monthlyContribution: Number(data.get("contribution")),
          expectedReturnRate: 0,
          projectedCompletionDate: "Not funded within 100 years",
        }),
      );
      await onSave(
        goal
          ? report.goals.map((item) => (item.id === goal.id ? updated : item))
          : [...report.goals, updated],
      );
      setSelected(updated.id);
      setFeedback("Goal saved on this device.");
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not save the goal.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-xl border border-white/10 p-3">
      <summary className="cursor-pointer text-xs font-bold">
        Create or Edit Goal
      </summary>
      <label className="mt-3 block text-xs">
        Goal to edit
        <select
          value={selected}
          onChange={(event) => {
            setSelected(event.target.value);
            setFeedback("");
          }}
          className={inputClass}
        >
          <option value="new">New custom goal</option>
          {report.goals.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      <form
        key={selected}
        onSubmit={submit}
        className="mt-3 grid gap-3 sm:grid-cols-2"
      >
        <label className="text-xs">
          Goal title
          <input
            name="title"
            required
            maxLength={100}
            defaultValue={goal?.title}
            className={inputClass}
          />
        </label>
        <label className="text-xs">
          Goal target (₹)
          <input
            name="target"
            type="number"
            min="0.01"
            step="0.01"
            required
            defaultValue={goal?.targetAmount}
            className={inputClass}
          />
        </label>
        <label className="text-xs">
          Goal saved amount (₹)
          <input
            name="current"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={goal?.currentAmount ?? 0}
            className={inputClass}
          />
        </label>
        <label className="text-xs">
          Monthly contribution (₹)
          <input
            name="contribution"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={goal?.monthlyContribution ?? 0}
            className={inputClass}
          />
        </label>
        <label className="text-xs">
          Goal deadline
          <input
            name="deadline"
            type="date"
            required
            defaultValue={goal?.deadline}
            className={inputClass}
          />
        </label>
        <button
          disabled={busy || (!goal && report.goals.length >= 50)}
          type="submit"
          className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold disabled:opacity-40"
        >
          Save Goal
        </button>
      </form>
      {feedback && (
        <p role="status" className="mt-2 text-xs">
          {feedback}
        </p>
      )}
    </details>
  );
}
