"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  LocalFinanceDatabase,
  type UserPreferences,
} from "@/lib/local-storage";
import type { InsightReport } from "@/lib/schemas";
import {
  authenticateCloud,
  CloudSessionError,
  deleteCloudAccount,
  listCloudDevices,
  revokeCloudDevice,
  signOutCloud,
  synchronizeCloud,
} from "@/lib/cloud-sync";

export default function CloudSyncPanel({
  report,
  preferences,
  onPreferences,
  onReport,
}: {
  report: InsightReport | null;
  preferences: UserPreferences;
  onPreferences: (preferences: UserPreferences) => void;
  onReport: (report: InsightReport) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [devices, setDevices] = useState<
    Awaited<ReturnType<typeof listCloudDevices>>
  >([]);
  const inputClass =
    "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white";

  function savePreferences(updates: Partial<UserPreferences>) {
    try {
      onPreferences(LocalFinanceDatabase.savePreferences(updates));
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Could not save cloud settings.",
      );
    }
  }

  function showError(error: unknown) {
    if (error instanceof CloudSessionError)
      onPreferences(LocalFinanceDatabase.getPreferences());
    setFeedback(
      error instanceof Error ? error.message : "The backend is unreachable.",
    );
  }

  async function signOut() {
    setBusy(true);
    try {
      onPreferences(await signOutCloud(preferences));
      setDevices([]);
      setFeedback("Signed out. Your server session was revoked.");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function manageDevices(deviceId?: string) {
    setBusy(true);
    try {
      if (deviceId) {
        await revokeCloudDevice(preferences, deviceId);
        if (deviceId === preferences.deviceId) {
          onPreferences(LocalFinanceDatabase.getPreferences());
          setDevices([]);
          setFeedback("This device's cloud sessions were revoked.");
          return;
        }
      }
      setDevices(await listCloudDevices(preferences));
      setFeedback(
        deviceId
          ? "Device access revoked."
          : "Registered cloud devices loaded.",
      );
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function signIn(mode: "login" | "register") {
    setBusy(true);
    setFeedback(null);
    try {
      onPreferences(
        await authenticateCloud(preferences, email, password, mode),
      );
      setPassword("");
      setFeedback(
        "Signed in. Cloud uploads only run when you enable and start synchronization.",
      );
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Could not authenticate with the backend.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await synchronizeCloud(report, preferences);
      onPreferences(result.preferences);
      if (result.report) onReport(result.report);
      setFeedback(result.message);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (
      !confirm(
        "Permanently delete your cloud account and its synchronized data? Local reports will stay on this device.",
      )
    )
      return;
    setBusy(true);
    try {
      await deleteCloudAccount(preferences);
      savePreferences({
        authToken: "",
        authEmail: "",
        cloudSyncOptIn: false,
        lastSyncTimestamp: "",
      });
      setFeedback("Cloud account and synchronized data deleted.");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <RefreshCw size={18} className="text-blue-400" />
        <h4 className="text-xs font-bold text-white">
          Render Cloud Sync (Opt-In)
        </h4>
      </div>
      <p className="text-xs text-zinc-400">
        Connect your deployed FinanceIQ backend to synchronize the full report,
        transactions, and goals. Local processing works without an account or
        network.
      </p>
      <label className="block text-xs text-zinc-400">
        Backend URL
        <input
          type="url"
          value={preferences.cloudSyncUrl ?? ""}
          disabled={busy || Boolean(preferences.authToken)}
          onChange={(event) =>
            savePreferences({
              cloudSyncUrl: event.target.value,
              authToken: "",
              authEmail: "",
              cloudSyncOptIn: false,
              lastSyncTimestamp: "",
            })
          }
          placeholder="https://your-financeiq-backend.onrender.com"
          className={inputClass}
        />
      </label>
      {preferences.authToken ? (
        <div className="space-y-3">
          <p className="text-xs text-zinc-300">
            Signed in as {preferences.authEmail}
          </p>
          <label className="flex items-start gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              aria-label="Allow uploading my report and transactions to this backend when I sync."
              checked={preferences.cloudSyncOptIn}
              disabled={busy}
              onChange={(event) =>
                savePreferences({
                  cloudSyncOptIn: event.target.checked,
                  ...(event.target.checked ? { localOnlyMode: false } : {}),
                })
              }
              className="accent-blue-500"
            />
            Allow uploading my report and transactions to this backend when I
            sync (disables local-only mode).
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={sync}
              disabled={busy || !preferences.cloudSyncOptIn}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
            >
              {busy ? "Connecting..." : "Sync To Render Cloud"}
            </button>
            <button
              type="button"
              onClick={signOut}
              disabled={busy}
              className="rounded-lg border border-white/15 px-3 py-2 text-xs"
            >
              Sign Out
            </button>
            <button
              type="button"
              onClick={() => manageDevices()}
              disabled={busy}
              className="rounded-lg border border-white/15 px-3 py-2 text-xs"
            >
              Manage Devices
            </button>
            <button
              type="button"
              onClick={deleteAccount}
              disabled={busy}
              className="rounded-lg border border-rose-500/30 px-3 py-2 text-xs text-rose-300"
            >
              Delete Cloud Account
            </button>
          </div>
          {devices.length > 0 && (
            <ul aria-label="Cloud devices" className="space-y-2">
              {devices.map((device) => (
                <li
                  key={device.id}
                  className="flex items-center justify-between gap-2 text-xs text-zinc-300"
                >
                  <span>
                    {device.deviceName}
                    {device.id === preferences.deviceId ? " (this device)" : ""}
                    {device.isRevoked ? " — revoked" : ""}
                  </span>
                  {!device.isRevoked && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => manageDevices(device.id)}
                      className="text-rose-300"
                    >
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs text-zinc-400">
            Cloud email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              disabled={busy}
              className={inputClass}
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Cloud password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              minLength={8}
              maxLength={72}
              disabled={busy}
              className={inputClass}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => signIn("login")}
              disabled={busy || !email || password.length < 8}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold disabled:opacity-40"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => signIn("register")}
              disabled={busy || !email || password.length < 8}
              className="rounded-lg border border-white/15 px-3 py-2 text-xs disabled:opacity-40"
            >
              Create Cloud Account
            </button>
          </div>
        </div>
      )}
      {feedback && (
        <p role="status" className="text-xs text-zinc-300">
          {feedback}
        </p>
      )}
    </div>
  );
}
