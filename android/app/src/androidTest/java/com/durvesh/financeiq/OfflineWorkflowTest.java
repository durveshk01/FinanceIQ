package com.durvesh.financeiq;

import static org.junit.Assert.*;

import android.app.Instrumentation;
import android.app.UiAutomation;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.graphics.Bitmap;
import android.os.SystemClock;
import android.util.Base64;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Real WebView, bundled workers, Android document picker and share sheet; no server. */
@RunWith(AndroidJUnit4.class)
public class OfflineWorkflowTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final UiAutomation automation = instrumentation.getUiAutomation();
    private final Context context = instrumentation.getTargetContext();
    private ActivityScenario<MainActivity> scenario;
    private WebView webView;

    @Test
    public void completeOfflineWorkflow() throws Exception {
        try {
            launch();
            assertEquals("https://localhost", eval("location.origin"));
            assertEquals(Boolean.TRUE, eval("window.Capacitor.isNativePlatform()"));
            if ("release".equals(InstrumentationRegistry.getArguments().getString("buildType"))) {
                assertEquals(0, context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE);
            }
            assertEquals(0, context.getApplicationInfo().flags & ApplicationInfo.FLAG_ALLOW_BACKUP);
            step("Offline launch and native bridge");

            // Open the actual Android system picker and select the fixture pushed by the runner.
            tapButton("Import Statement");
            waitForNode("Show roots", 30000);
            clickNode("Show roots");
            clickNode("Downloads");
            clickNode("statement.csv");
            waitForReport("statement.csv", 45000);
            assertStatement(readReport());
            step("Android document picker and CSV reconciliation");

            clickTab("Transactions");
            eval("Array.from(document.querySelectorAll('tbody tr')).find(row=>row.textContent.includes('Swiggy')).querySelector('button').click(); true");
            waitFor("document.querySelector('tbody')?.textContent.includes('Include')", 15000);
            assertEquals(300, readReport().getJSONObject("totals").getDouble("expenses"), 0.001);
            assertEquals(11579.5, readReport().getJSONObject("balances").getJSONObject("calculatedClosing").getDouble("amount"), 0.001);
            assertEquals("[]", eval("JSON.stringify(window.__financeNetwork)"));
            scenario.close();
            launch();
            assertEquals(300, readReport().getJSONObject("totals").getDouble("expenses"), 0.001);
            step("Persistent exclusions and fresh WebView restore");

            importAsset("encrypted.pdf", "application/pdf", "Import bank statements");
            waitFor("document.body.textContent.includes('password protected')", 30000);
            assertEquals(300, readReport().getJSONObject("totals").getDouble("expenses"), 0.001);
            eval("const password=document.querySelector('input[type=password]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(password,'statement-pass'); password.dispatchEvent(new Event('input',{bubbles:true})); true");
            SystemClock.sleep(300);
            importAsset("encrypted.pdf", "application/pdf", "Import bank statements");
            waitForReport("encrypted.pdf", 60000);
            assertStatement(readReport());
            step("Password errors preserve data; encrypted multi-page PDF import");

            importAsset("statement.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Import bank statements");
            waitForReport("statement.xlsx", 45000);
            assertStatement(readReport());
            step("Native XLSX import");

            importAsset("scanned.pdf", "application/pdf", "Import bank statements");
            waitForReport("scanned.pdf", 180000);
            JSONObject scanned = readReport();
            assertStatement(scanned);
            JSONArray transactions = scanned.getJSONArray("transactions");
            for (int i = 0; i < transactions.length(); i++) assertTrue(transactions.getJSONObject(i).getDouble("confidence") <= 0.7);
            step("All four scanned PDF pages recognized offline");

            for (String tab : new String[]{"Analytics", "Transactions", "Subscriptions", "Forecast & Goals", "AI Coach", "Privacy & Sync", "Exports", "Overview"}) {
                clickTab(tab);
                assertEquals(Boolean.TRUE, eval("document.documentElement.scrollWidth<=innerWidth+1"));
            }
            clickTab("AI Coach");
            clickButton("How much did I save?", false);
            waitFor("document.body.textContent.includes('net savings totaled')", 15000);
            clickTab("Transactions");
            pressBack();
            waitFor("Array.from(document.querySelectorAll('[role=tab]')).some(tab=>tab.textContent==='Overview'&&tab.getAttribute('aria-selected')==='true')", 15000);
            step("Responsive tabs, local coach and Android back navigation");

            clickTab("Exports");
            File csv = exportFile("CSV Statement Ledger", "FinanceIQ_Statement_Report.csv");
            assertTrue(new String(readFile(csv), StandardCharsets.UTF_8).contains("-120.5"));
            File xlsx = exportFile("Excel Workbook", "FinanceIQ_Statement.xlsx");
            assertEquals("PK", new String(readFile(xlsx), 0, 2, StandardCharsets.US_ASCII));
            File pdf = exportFile("PDF Health Dossier", "FinanceIQ_Health_Report.pdf");
            assertEquals("%PDF-", new String(readFile(pdf), 0, 5, StandardCharsets.US_ASCII));
            File json = exportFile("Structured JSON Archive", "FinanceIQ_Report_Backup.json");
            assertStatement(new JSONObject(new String(readFile(json), StandardCharsets.UTF_8)));
            step("CSV, XLSX, PDF and JSON written through native Filesystem and Share");

            clickTab("Privacy & Sync");
            File backup = exportFile("Export Full Backup (JSON)", "FinanceIQ_Local_Backup.json");
            byte[] backupBytes = readFile(backup);
            JSONObject archive = new JSONObject(new String(backupBytes, StandardCharsets.UTF_8));
            assertFalse(archive.getJSONObject("preferences").has("authToken"));
            assertFalse(archive.getJSONObject("preferences").has("authEmail"));
            clickButton("Clear Local Data", false);
            waitForNode("OK", 15000);
            clickNode("OK");
            waitFor("document.body.textContent.includes('No Statement Loaded')", 15000);
            assertFalse(new File(context.getCacheDir(), "financeiq-exports").exists());
            assertNull(readReport());
            importBytes(backupBytes, "backup.json", "application/json", "Restore FinanceIQ backup");
            waitFor("document.body.textContent.includes('Financial Command Center')", 15000);
            assertStatement(readReport());
            assertEquals("[]", eval("JSON.stringify(window.__financeNetwork||[])"));
            step("Credential-free backup, native cache/data erasure, restore and no external/API calls");
            screenshot("offline-workflow.png");
        } catch (Throwable error) {
            screenshot("offline-failure.png");
            if (webView != null) {
                System.out.println("NATIVE_DOM: " + eval("document.body.innerText.slice(0,7000)"));
                System.out.println("NATIVE_WORKERS: " + eval("JSON.stringify(window.__financeWorkers||[])"));
                System.out.println("NATIVE_ERRORS: " + eval("JSON.stringify(window.__financeErrors||[])"));
            }
            throw error;
        } finally {
            if (scenario != null) scenario.close();
        }
    }

    private void launch() throws Exception {
        scenario = ActivityScenario.launch(MainActivity.class);
        scenario.onActivity(activity -> webView = activity.getBridge().getWebView());
        waitFor("!!document.querySelector('button') && !document.body.textContent.includes('Restoring Device Data...')", 45000);
        eval("window.__financeNetwork=[]; const nativeFetch=window.fetch; window.fetch=function(input,...args){const url=new URL(typeof input==='string'?input:input.url,location.href); if(url.origin!==location.origin||url.pathname.startsWith('/api/'))window.__financeNetwork.push(url.href);return nativeFetch.call(this,input,...args)}; true");
        eval("window.__financeWorkers=[];window.__financeErrors=[];const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{constructor(url,options){super(url,options);const trace={url:String(url),events:[]};window.__financeWorkers.push(trace);this.addEventListener('message',({data})=>{if(trace.events.length<200)trace.events.push({action:data?.action,status:data?.status,data:data?.status==='progress'||data?.status==='reject'?data.data:undefined})});this.addEventListener('error',event=>trace.events.push({error:event.message,filename:event.filename,line:event.lineno}))}};window.addEventListener('error',event=>window.__financeErrors.push(event.message));window.addEventListener('unhandledrejection',event=>window.__financeErrors.push(String(event.reason)));true");
    }

    private Object eval(String script) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> webView.evaluateJavascript("(function(){return eval(" + JSONObject.quote(script) + ");})()", value -> { result.set(value); latch.countDown(); }));
        assertTrue("WebView JavaScript evaluation timed out", latch.await(15, TimeUnit.SECONDS));
        Object value = new JSONTokener(result.get()).nextValue();
        if (value == JSONObject.NULL) throw new AssertionError("JavaScript did not complete: " + script.substring(0, Math.min(script.length(), 400)));
        return value;
    }

    private void waitFor(String expression, long timeout) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + timeout;
        do {
            if (Boolean.TRUE.equals(eval("Boolean(" + expression + ")"))) return;
            SystemClock.sleep(250);
        } while (SystemClock.elapsedRealtime() < deadline);
        fail("Timed out waiting for: " + expression);
    }

    private JSONObject readReport() throws Exception {
        eval("window.__financeReport=undefined; const request=indexedDB.open('financeiq',1); request.onsuccess=()=>{const db=request.result;const read=db.transaction('records').objectStore('records').get('financeiq_active_report');read.onsuccess=()=>{window.__financeReport=JSON.stringify(read.result??null);db.close()}}; true");
        waitFor("window.__financeReport!==undefined", 15000);
        String value = (String) eval("window.__financeReport");
        return "null".equals(value) ? null : new JSONObject(value);
    }

    private void waitForReport(String filename, long timeout) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + timeout;
        do {
            JSONObject report = readReport();
            if (report != null && report.getJSONObject("importSummary").getJSONArray("fileNames").toString().contains(filename)) return;
            SystemClock.sleep(500);
        } while (SystemClock.elapsedRealtime() < deadline);
        fail("Import failed or timed out: " + filename + "; " + eval("document.body.innerText.slice(0,2500)"));
    }

    private void assertStatement(JSONObject report) throws Exception {
        assertNotNull(report);
        JSONArray rows = report.getJSONArray("transactions");
        assertEquals(4, rows.length());
        double[] amounts = {10000, -120.5, -300, -3000};
        for (int i = 0; i < amounts.length; i++) assertEquals(amounts[i], rows.getJSONObject(i).getDouble("amount"), 0.001);
        assertEquals(10000, report.getJSONObject("totals").getDouble("income"), 0.001);
        assertEquals(420.5, report.getJSONObject("totals").getDouble("expenses"), 0.001);
        assertEquals(11579.5, report.getJSONObject("balances").getJSONObject("closing").getDouble("amount"), 0.001);
    }

    private void clickTab(String title) throws Exception {
        eval("Array.from(document.querySelectorAll('[role=tab]')).find(tab=>tab.textContent===" + JSONObject.quote(title) + ").click(); true");
        waitFor("Array.from(document.querySelectorAll('[role=tab]')).some(tab=>tab.textContent===" + JSONObject.quote(title) + "&&tab.getAttribute('aria-selected')==='true')", 15000);
    }

    private void clickButton(String text, boolean prefix) throws Exception {
        eval("Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()" + (prefix ? ".startsWith(" : "===(") + JSONObject.quote(text) + ")).click(); true");
    }

    private void tapButton(String text) throws Exception {
        eval("const button=Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()===" + JSONObject.quote(text) + ");button.scrollIntoView({block:'center',behavior:'instant'});true");
        SystemClock.sleep(300);
        JSONArray position = (JSONArray) eval("(()=>{const rect=Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()===" + JSONObject.quote(text) + ").getBoundingClientRect();return[rect.x+rect.width/2,rect.y+rect.height/2,innerWidth]})()");
        int[] location = new int[2];
        instrumentation.runOnMainSync(() -> webView.getLocationOnScreen(location));
        float scale = (float) webView.getWidth() / (float) position.getDouble(2);
        float x = location[0] + (float) position.getDouble(0) * scale;
        float y = location[1] + (float) position.getDouble(1) * scale;
        long now = SystemClock.uptimeMillis();
        MotionEvent down = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, x, y, 0);
        MotionEvent up = MotionEvent.obtain(now, now + 80, MotionEvent.ACTION_UP, x, y, 0);
        down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        automation.injectInputEvent(down, true);
        automation.injectInputEvent(up, true);
        down.recycle();
        up.recycle();
    }

    private AccessibilityNodeInfo node(AccessibilityNodeInfo root, String text) {
        if (root == null) return null;
        if (root.isVisibleToUser() && (text.contentEquals(root.getText() == null ? "" : root.getText()) || text.contentEquals(root.getContentDescription() == null ? "" : root.getContentDescription()))) {
            AccessibilityNodeInfo actionable = root;
            while (actionable != null && !actionable.isClickable()) actionable = actionable.getParent();
            if (actionable != null && actionable.isEnabled()) return root;
        }
        for (int i = 0; i < root.getChildCount(); i++) {
            AccessibilityNodeInfo found = node(root.getChild(i), text);
            if (found != null) return found;
        }
        return null;
    }

    private AccessibilityNodeInfo waitForNode(String text, long timeout) {
        long deadline = SystemClock.elapsedRealtime() + timeout;
        do {
            AccessibilityNodeInfo found = node(automation.getRootInActiveWindow(), text);
            if (found != null) return found;
            SystemClock.sleep(300);
        } while (SystemClock.elapsedRealtime() < deadline);
        throw new AssertionError("Android UI element not found: " + text);
    }

    private void clickNode(String text) {
        AccessibilityNodeInfo found = waitForNode(text, 30000);
        while (found != null && !found.isClickable()) found = found.getParent();
        assertNotNull("Android UI element is not clickable: " + text, found);
        assertTrue(found.performAction(AccessibilityNodeInfo.ACTION_CLICK));
    }

    private void pressBack() {
        long now = SystemClock.uptimeMillis();
        automation.injectInputEvent(new KeyEvent(now, now, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BACK, 0), true);
        automation.injectInputEvent(new KeyEvent(now, now, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_BACK, 0), true);
    }

    private void importAsset(String name, String mime, String label) throws Exception {
        try (InputStream stream = instrumentation.getContext().getAssets().open(name)) {
            importBytes(readBytes(stream), name, mime, label);
        }
    }

    private void importBytes(byte[] bytes, String name, String mime, String label) throws Exception {
        String encoded = Base64.encodeToString(bytes, Base64.NO_WRAP);
        eval("(()=>{const bytes=Uint8Array.from(atob(" + JSONObject.quote(encoded) + "),char=>char.charCodeAt(0)); const transfer=new DataTransfer();transfer.items.add(new File([bytes]," + JSONObject.quote(name) + ",{type:" + JSONObject.quote(mime) + "}));const input=document.querySelector(" + JSONObject.quote("input[aria-label=\"" + label + "\"]") + ");input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
    }

    private File exportFile(String button, String filename) throws Exception {
        clickButton(button, true);
        File file = new File(context.getCacheDir(), "financeiq-exports/" + filename);
        long deadline = SystemClock.elapsedRealtime() + 60000;
        while ((!file.exists() || file.length() == 0) && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(250);
        assertTrue("Native export not written: " + filename, file.isFile() && file.length() > 0);
        try (InputStream readable = context.getContentResolver().openInputStream(FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file))) {
            assertNotNull(readable);
            assertTrue(readable.read() >= 0);
        }
        deadline = SystemClock.elapsedRealtime() + 15000;
        boolean chooser = false;
        while (SystemClock.elapsedRealtime() < deadline) {
            AccessibilityNodeInfo root = automation.getRootInActiveWindow();
            String pkg = root != null ? String.valueOf(root.getPackageName()) : "";
            if (pkg.equals("android") || pkg.contains("intentresolver")) { chooser = true; break; }
            SystemClock.sleep(250);
        }
        assertTrue("Android share sheet did not open for " + filename, chooser);
        pressBack();
        waitFor("Array.from(document.querySelectorAll('button')).filter(button=>button.textContent.trim().startsWith(" + JSONObject.quote(button) + ")).every(button=>!button.disabled)", 15000);
        return file;
    }

    private byte[] readFile(File file) throws Exception {
        try (InputStream stream = new FileInputStream(file)) { return readBytes(stream); }
    }

    private byte[] readBytes(InputStream stream) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = stream.read(buffer)) != -1) output.write(buffer, 0, count);
        return output.toByteArray();
    }

    private void screenshot(String name) {
        Bitmap bitmap = automation.takeScreenshot();
        if (bitmap == null) return;
        try (FileOutputStream stream = new FileOutputStream(new File(context.getExternalFilesDir(null), name))) {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream);
        } catch (Exception ignored) { }
        bitmap.recycle();
    }

    private void step(String message) { System.out.println("NATIVE_PASS: " + message); }
}
