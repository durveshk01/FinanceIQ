import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import {
  createPdfStatement,
  fixtureReport,
  statementCsv,
} from "../tests/fixtures";
import { reportToXlsx } from "../src/lib/exporters";

const root = process.cwd();
const args = process.argv.slice(2);
function option(name: string) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
if (args.includes("--help")) {
  console.log(
    "Usage: npm run test:android -- --serial emulator-5554 [--release] [--skip-build]",
  );
  console.log(
    "Uses a fresh verification emulator; clears FinanceIQ app data, disables networking, and tests the real Android picker, workers, storage and share sheet.",
  );
  process.exit(0);
}
const serial = option("--serial") ?? process.env.ANDROID_SERIAL;
if (!serial?.startsWith("emulator-"))
  throw new Error(
    "Specify the verification emulator with --serial emulator-<port>.",
  );
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
if (!sdk) throw new Error("Set ANDROID_HOME to the Android SDK directory.");
const adb = path.join(
  sdk,
  "platform-tools",
  process.platform === "win32" ? "adb.exe" : "adb",
);
const mode = args.includes("--release") ? "release" : "debug";
const assets = path.join(root, ".capacitor", "android-test-assets");
const diagnostics = path.join(root, "test-results", "android");

function run(command: string, argv: string[], cwd = root) {
  const result = spawnSync(command, argv, {
    cwd,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 600000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${path.basename(command)} failed: ${result.stdout}\n${result.stderr}`,
    );
  return result.stdout;
}
function device(...argv: string[]) {
  return run(adb, ["-s", serial!, ...argv]);
}

async function main() {
  await mkdir(assets, { recursive: true });
  await mkdir(diagnostics, { recursive: true });
  await writeFile(path.join(assets, "statement.csv"), statementCsv);
  await writeFile(
    path.join(assets, "encrypted.pdf"),
    await createPdfStatement({ pages: 4, encrypted: true }),
  );
  await writeFile(
    path.join(assets, "scanned.pdf"),
    await createPdfStatement({ pages: 4, scanned: true }),
  );
  await writeFile(
    path.join(assets, "statement.xlsx"),
    new Uint8Array((await reportToXlsx(fixtureReport())) as ArrayBuffer),
  );
  assert.equal(device("get-state").trim(), "device");
  assert.equal(
    device("shell", "getprop", "sys.boot_completed").trim(),
    "1",
    "Wait for the emulator to finish booting.",
  );
  const metadata = {
    serial,
    mode,
    api: device("shell", "getprop", "ro.build.version.sdk").trim(),
    webview: device("shell", "dumpsys", "webviewupdate"),
  };
  console.log(`Android ${metadata.api} ${mode} verification on ${serial}`);
  if (!args.includes("--skip-build")) {
    const tasks = [
      `assemble${mode === "release" ? "Release" : "Debug"}AndroidTest`,
      `-PandroidTestBuildType=${mode}`,
      "--no-daemon",
      "--console=plain",
    ];
    const log =
      process.platform === "win32"
        ? run(
            process.env.ComSpec ?? "cmd.exe",
            ["/d", "/s", "/c", "gradlew.bat", ...tasks],
            path.join(root, "android"),
          )
        : run("sh", ["gradlew", ...tasks], path.join(root, "android"));
    await writeFile(path.join(diagnostics, "gradle.log"), log);
    console.log("Android instrumentation APK built.");
  }
  device(
    "install",
    "-r",
    path.join(root, "dist", "android", `FinanceIQ-${mode}.apk`),
  );
  device(
    "install",
    "-r",
    path.join(
      root,
      "android",
      "app",
      "build",
      "outputs",
      "apk",
      "androidTest",
      mode,
      `app-${mode}-androidTest.apk`,
    ),
  );
  assert.match(
    device("shell", "pm", "clear", "com.durvesh.financeiq"),
    /Success/,
  );
  device(
    "push",
    path.join(assets, "statement.csv"),
    "/sdcard/Download/statement.csv",
  );
  device("shell", "svc", "wifi", "disable");
  device("shell", "svc", "data", "disable");
  device("shell", "settings", "put", "global", "airplane_mode_on", "1");
  device("shell", "settings", "put", "global", "window_animation_scale", "0");
  device(
    "shell",
    "settings",
    "put",
    "global",
    "transition_animation_scale",
    "0",
  );
  device("shell", "settings", "put", "global", "animator_duration_scale", "0");
  device("shell", "input", "keyevent", "KEYCODE_WAKEUP");
  device("shell", "wm", "dismiss-keyguard");
  device("logcat", "-c");
  try {
    const output = device(
      "shell",
      "am",
      "instrument",
      "-w",
      "-r",
      "-e",
      "class",
      "com.durvesh.financeiq.OfflineWorkflowTest",
      "-e",
      "buildType",
      mode,
      "com.durvesh.financeiq.test/androidx.test.runner.AndroidJUnitRunner",
    );
    await writeFile(path.join(diagnostics, "instrumentation.log"), output);
    console.log(output);
    assert.match(
      output,
      /OK \(1 test\)/,
      "Native offline workflow failed; inspect test-results/android.",
    );
    device("shell", "am", "force-stop", "com.durvesh.financeiq");
    device(
      "shell",
      "am",
      "start",
      "-W",
      "-n",
      "com.durvesh.financeiq/.MainActivity",
    );
    let coldStart = "";
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const dump = device(
        "shell",
        "uiautomator",
        "dump",
        "/sdcard/financeiq-cold-start.xml",
      );
      if (dump.includes("dumped to")) {
        coldStart = device("shell", "cat", "/sdcard/financeiq-cold-start.xml");
        if (coldStart.includes("Financial Command Center")) break;
      }
      device("shell", "input", "swipe", "540", "1900", "540", "600", "300");
    }
    await writeFile(path.join(diagnostics, "cold-start.xml"), coldStart);
    assert.ok(
      coldStart.includes("Financial Command Center"),
      "The restored report did not survive a cold process restart offline.",
    );
    console.log(
      "Native cold process restart retained the restored report offline.",
    );
  } finally {
    await writeFile(
      path.join(diagnostics, "logcat.log"),
      device("logcat", "-d", "-t", "2000"),
    );
    await writeFile(
      path.join(diagnostics, "metadata.json"),
      JSON.stringify(metadata, null, 2),
    );
    try {
      device(
        "pull",
        "/sdcard/Android/data/com.durvesh.financeiq/files/",
        diagnostics,
      );
    } catch {
      console.warn(
        "Native file diagnostics unavailable; primary result and logcat retained.",
      );
    }
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
