package de.rezicheck.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Rezi-Check: Oberfläche (lokales HTML) + unsichtbarer Amazon-WebView, der die
 * Produktseite lädt und per Skript ausliest. Alles bleibt auf dem Gerät.
 */
public class MainActivity extends Activity {

    private static final String UI_URL = "file:///android_asset/ui/index.html";
    private static final String DEFAULT_SIGNIN =
            "https://www.amazon.de/ap/signin?openid.pape.max_auth_age=0"
            + "&openid.return_to=https%3A%2F%2Fwww.amazon.de%2F"
            + "&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select"
            + "&openid.assoc_handle=deflex&openid.mode=checkid_setup"
            + "&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select"
            + "&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0";
    private static final Pattern ASIN_IN_URL =
            Pattern.compile("/(?:dp|gp/product|gp/aw/d|product-reviews)/([A-Z0-9]{10})", Pattern.CASE_INSENSITIVE);
    private static final Pattern LOGIN_COOKIE = Pattern.compile("(?:^|;\\s*)(?:sess-)?at-[a-z]+=");

    private final Handler h = new Handler(Looper.getMainLooper());
    private final Random rnd = new Random();

    private FrameLayout root;
    private WebView ui;
    private WebView worker;
    private LinearLayout pane;       // sichtbarer Amazon-Bereich (Anmeldung / Sicherheitsabfrage)
    private TextView paneText;
    private Button paneButton;

    private String extractJs;
    private String desktopUa;
    private boolean uiReady;
    private volatile String pendingUrl;
    private volatile boolean uiCanGoBack;
    private boolean loginMode;
    private SharedPreferences prefs;

    private Job job;

    /* ---------- Prüfauftrag ---------- */
    private static final class Phase {
        final String name, url, label;
        final JSONObject opts;
        final long timeoutMs;
        Phase(String name, String url, String label, JSONObject opts, long timeoutMs) {
            this.name = name; this.url = url; this.label = label; this.opts = opts; this.timeoutMs = timeoutMs;
        }
    }

    private static final class Job {
        String url, mode;
        final List<Phase> phases = new ArrayList<>();
        int idx = -1;
        final JSONObject results = new JSONObject();
        final JSONObject flags = new JSONObject();
        final JSONArray errors = new JSONArray();
        boolean injected, awaitingUser, finished, loadIssued;
        int pollToken, interactions;
        String lastProgress = "";
        JSONObject lastDiag;
        Phase current() { return idx >= 0 && idx < phases.size() ? phases.get(idx) : null; }
    }

    /* ---------- Lebenszyklus ---------- */
    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("rezicheck", MODE_PRIVATE);
        extractJs = readAsset("extract.js");
        boolean dark = isDarkMode();
        int bg = dark ? Color.parseColor("#0E1526") : Color.parseColor("#E6ECF5");

        root = new FrameLayout(this);
        root.setBackgroundColor(bg);
        setContentView(root);
        setupSystemBars(dark, bg);

        // Amazon-WebView (liegt unter der Oberfläche)
        pane = new LinearLayout(this);
        pane.setOrientation(LinearLayout.VERTICAL);
        pane.setBackgroundColor(bg);
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        int p = dp(12);
        bar.setPadding(dp(16), p, dp(8), p);
        bar.setBackgroundColor(dark ? Color.parseColor("#172036") : Color.WHITE);
        paneText = new TextView(this);
        paneText.setTextColor(dark ? Color.parseColor("#E7ECF6") : Color.parseColor("#16233F"));
        paneText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        bar.addView(paneText, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        paneButton = new Button(this);
        paneButton.setAllCaps(false);
        paneButton.setText("Fertig");
        paneButton.setOnClickListener(v -> onPaneButton());
        bar.addView(paneButton, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        pane.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        worker = new WebView(this);
        setupWorker();
        pane.addView(worker, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        root.addView(pane, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // Oberfläche
        ui = new WebView(this);
        ui.setBackgroundColor(bg);
        WebSettings us = ui.getSettings();
        us.setJavaScriptEnabled(true);
        us.setDomStorageEnabled(true);
        us.setAllowFileAccess(false);
        us.setAllowContentAccess(false);
        us.setTextZoom(100);
        ui.addJavascriptInterface(new Bridge(), "Android");
        ui.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                openExternal(request.getUrl().toString());
                return true;
            }
            @Override
            public void onPageFinished(WebView view, String url) {
                uiReady = true;
            }
        });
        root.addView(ui, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        ui.loadUrl(UI_URL);

        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onDestroy() {
        h.removeCallbacksAndMessages(null);
        if (worker != null) worker.destroy();
        if (ui != null) ui.destroy();
        super.onDestroy();
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (pane.getVisibility() == View.VISIBLE && ui.getVisibility() != View.VISIBLE) {
            if (loginMode) { closeLogin(); return; }
            if (job != null) { cancelJob(true); return; }
            hidePane();
            return;
        }
        if (uiCanGoBack) { js("RC.back()"); return; }
        super.onBackPressed();
    }

    /* ---------- System-Leisten (Edge-to-Edge ab Android 15) ---------- */
    @SuppressWarnings("deprecation")
    private void setupSystemBars(boolean dark, int bg) {
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int l, t, r, b;
            if (Build.VERSION.SDK_INT >= 30) {
                Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime() | WindowInsets.Type.displayCutout());
                l = i.left; t = i.top; r = i.right; b = i.bottom;
            } else {
                l = insets.getSystemWindowInsetLeft(); t = insets.getSystemWindowInsetTop();
                r = insets.getSystemWindowInsetRight(); b = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(l, t, r, b);
            return Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : insets.consumeSystemWindowInsets();
        });
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(dark ? 0 : mask, mask);
            }
        } else {
            int flags = getWindow().getDecorView().getSystemUiVisibility();
            if (!dark) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (!dark && Build.VERSION.SDK_INT >= 26) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            getWindow().getDecorView().setSystemUiVisibility(flags);
        }
        if (Build.VERSION.SDK_INT < 35) {
            getWindow().setStatusBarColor(bg);
            getWindow().setNavigationBarColor(bg);
        }
    }

    private boolean isDarkMode() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    /* ---------- Amazon-WebView ---------- */
    @SuppressLint("SetJavaScriptEnabled")
    private void setupWorker() {
        WebSettings s = worker.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setLoadsImagesAutomatically(true);
        s.setBlockNetworkImage(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);
        // Desktop-Ansicht: deren Aufbau ist stabiler und enthält Sterneverteilung + Rezensionen
        String def = WebSettings.getDefaultUserAgent(this);
        Matcher m = Pattern.compile("Chrome/([\\d.]+)").matcher(def);
        String ver = m.find() ? m.group(1) : "140.0.0.0";
        desktopUa = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + ver + " Safari/537.36";
        s.setUserAgentString(desktopUa);

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(worker, true);

        worker.setWebChromeClient(new WebChromeClient());
        worker.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                return !("http".equals(scheme) || "https".equals(scheme));
            }
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                if (job != null && !job.finished) {
                    job.injected = false;
                    job.pollToken++;
                    h.removeCallbacks(injectRunnable);
                }
            }
            @Override
            public void onPageFinished(WebView view, String url) {
                if (loginMode) { notifyLogin(); return; }
                if (job == null || job.finished || url == null || url.startsWith("about:")) return;
                h.removeCallbacks(injectRunnable);
                h.postDelayed(injectRunnable, 900);
            }
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame() || job == null || job.finished || job.awaitingUser) return;
                Phase ph = job.current();
                String msg = String.valueOf(error.getDescription());
                if (ph != null && "product".equals(ph.name)) {
                    fail("load_failed", msg);
                } else {
                    job.errors.put("Seite nicht geladen: " + msg);
                    nextPhase();
                }
            }
        });
    }

    private final Runnable injectRunnable = this::inject;

    private void inject() {
        if (job == null || job.finished || job.injected || !job.loadIssued) return;
        Phase ph = job.current();
        if (ph == null) return;
        job.injected = true;
        final int token = ++job.pollToken;
        String code = "window.__RC_OPTS=" + ph.opts.toString() + ";\n" + extractJs;
        worker.evaluateJavascript(code, null);
        h.postDelayed(() -> poll(token), 600);
    }

    private void poll(final int token) {
        if (job == null || job.finished || token != job.pollToken) return;
        worker.evaluateJavascript("(function(){return {r: window.__RC_RESULT || null, p: window.__RC_PROGRESS || ''};})()", value -> {
            if (job == null || job.finished || token != job.pollToken) return;
            try {
                Object o = new JSONTokener(value == null ? "null" : value).nextValue();
                if (o instanceof JSONObject) {
                    JSONObject jo = (JSONObject) o;
                    String prog = jo.optString("p", "");
                    if (!prog.isEmpty() && !prog.equals(job.lastProgress)) {
                        job.lastProgress = prog;
                        progress(prog);
                    }
                    Object r = jo.opt("r");
                    if (r instanceof JSONObject) {
                        worker.evaluateJavascript("window.__RC_RESULT=null;", null);
                        onPhaseResult((JSONObject) r);
                        return;
                    }
                }
            } catch (Exception ignored) { /* weiter abfragen */ }
            h.postDelayed(() -> poll(token), 500);
        });
    }

    /* ---------- Ablauf ---------- */
    private void startJob(String url, String mode) {
        if (job != null) cancelJob(false);
        if (loginMode) closeLogin();
        job = new Job();
        job.url = normalizeUrl(url);
        job.mode = "deep".equals(mode) ? "deep" : "quick";
        job.phases.add(new Phase("product", job.url, "Lade Produktseite", opts("product", 0, 0, ""), 60000));
        worker.getSettings().setBlockNetworkImage(true);
        worker.getSettings().setUseWideViewPort(true);
        hidePane();
        progress("Öffne Amazon …");
        nextPhase();
    }

    private void nextPhase() {
        if (job == null || job.finished) return;
        job.idx++;
        Phase ph = job.current();
        if (ph == null) { finishJob(); return; }
        job.injected = false;
        job.awaitingUser = false;
        job.loadIssued = false;
        job.pollToken++;
        final Job j = job;
        final Phase phase = ph;
        long delay = job.idx == 0 ? 0 : 1500 + rnd.nextInt(1500);
        h.postDelayed(() -> {
            if (job != j || j.finished) return;
            progress(phase.label + " …");
            j.loadIssued = true;
            worker.loadUrl(phase.url);
            scheduleTimeout(j, j.idx, phase.timeoutMs);
        }, delay);
    }

    private void scheduleTimeout(final Job j, final int idx, long ms) {
        h.postDelayed(() -> {
            if (job != j || j.finished || j.idx != idx) return;
            if (j.awaitingUser) { scheduleTimeout(j, idx, 15000); return; }   // Nutzer löst gerade etwas
            Phase ph = j.current();
            if (ph != null && "product".equals(ph.name)) {
                fail("timeout", "Zeitüberschreitung");
            } else {
                j.errors.put("Zeitüberschreitung beim Nachladen");
                nextPhase();
            }
        }, ms);
    }

    private void onPhaseResult(JSONObject r) {
        Phase ph = job.current();
        if (ph == null) return;
        JSONObject blocks = r.optJSONObject("blocks");
        if (blocks == null) blocks = new JSONObject();
        job.lastDiag = r.optJSONObject("diag");

        if (blocks.optBoolean("captcha") || ("product".equals(ph.name) && blocks.optBoolean("signin"))) {
            job.interactions++;
            if (job.interactions > 4) { fail(blocks.optBoolean("captcha") ? "captcha" : "signin", ""); return; }
            askUser(blocks.optBoolean("captcha")
                    ? "Amazon möchte prüfen, ob du ein Mensch bist. Bitte löse die Abfrage – danach geht es automatisch weiter."
                    : "Amazon verlangt eine Anmeldung. Melde dich an – danach geht es automatisch weiter.");
            job.injected = false;   // nach dem Lösen wird beim nächsten Seitenaufbau neu ausgelesen
            return;
        }
        if (job.awaitingUser) { job.awaitingUser = false; hidePane(); }

        try {
            if ("product".equals(ph.name)) {
                if (r.has("error")) { fail("script", r.optString("error")); return; }
                if (blocks.optBoolean("notProduct") || blocks.optBoolean("notFound") || !r.optBoolean("ok")) { fail("not_product", ""); return; }
                job.results.put("product", r);
                if (blocks.optBoolean("restricted")) job.flags.put("restricted", true);
                JSONObject prod = r.optJSONObject("product");
                String origin = prod != null ? prod.optString("origin", "") : "";
                String asin = prod != null ? prod.optString("asin", "") : "";
                if ("deep".equals(job.mode) && !origin.isEmpty() && !asin.isEmpty() && !blocks.optBoolean("restricted")) {
                    if (r.optBoolean("loggedIn") || isLoggedIn(origin)) {
                        String base = origin + "/product-reviews/" + asin + "/?ie=UTF8&reviewerType=all_reviews";
                        job.phases.add(new Phase("critical", base + "&filterByStar=critical&sortBy=recent&pageNumber=1",
                                "Lade kritische Rezensionen", opts("critical", 20, 2, "Kritische Rezensionen"), 90000));
                        job.phases.add(new Phase("recent", base + "&filterByStar=all_stars&sortBy=recent&pageNumber=1",
                                "Lade neueste Rezensionen", opts("recent", 30, 3, "Neueste Rezensionen"), 90000));
                    } else {
                        job.flags.put("needsLogin", true);
                    }
                }
            } else {
                if (blocks.optBoolean("signin")) {
                    job.flags.put("needsLogin", true);
                    skipRemaining();
                } else if (blocks.optBoolean("restricted")) {
                    job.flags.put("restricted", true);
                    if (r.optJSONArray("reviews") != null && r.optJSONArray("reviews").length() > 0) job.results.put(ph.name, r);
                    skipRemaining();
                } else if (r.has("error")) {
                    job.errors.put("Auslesen der " + ph.label.replace("Lade ", "") + " fehlgeschlagen");
                } else {
                    job.results.put(ph.name, r);
                }
            }
        } catch (Exception e) {
            job.errors.put(String.valueOf(e.getMessage()));
        }
        nextPhase();
    }

    private void skipRemaining() {
        while (job.phases.size() > job.idx + 1) job.phases.remove(job.phases.size() - 1);
    }

    private void finishJob() {
        if (job == null || job.finished) return;
        job.finished = true;
        try {
            JSONObject out = new JSONObject();
            out.put("mode", job.mode);
            out.put("url", job.url);
            out.put("phases", job.results);
            if (job.errors.length() > 0) job.flags.put("errors", job.errors);
            out.put("flags", job.flags);
            js("RC.onData(" + out + ")");
        } catch (Exception e) {
            js("RC.onError('script'," + JSONObject.quote(String.valueOf(e.getMessage())) + ",null)");
        }
        cleanupWorker();
        job = null;
    }

    private void fail(String code, String detail) {
        if (job == null || job.finished) return;
        job.finished = true;
        JSONObject diag = new JSONObject();
        try {
            diag.put("workerUrl", String.valueOf(worker.getUrl()));
            diag.put("workerTitle", String.valueOf(worker.getTitle()));
            diag.put("detail", detail);
            if (job.lastDiag != null) diag.put("page", job.lastDiag);
        } catch (Exception ignored) { }
        js("RC.onError(" + JSONObject.quote(code) + "," + JSONObject.quote(detail == null ? "" : detail) + "," + diag + ")");
        cleanupWorker();
        job = null;
    }

    private void cancelJob(boolean notify) {
        if (job == null) return;
        job.finished = true;
        job = null;
        cleanupWorker();
        if (notify) js("RC.onError('cancelled','',null)");
    }

    private void cleanupWorker() {
        h.removeCallbacks(injectRunnable);
        hidePane();
        worker.stopLoading();
        worker.loadUrl("about:blank");
        CookieManager.getInstance().flush();
    }

    private JSONObject opts(String phase, int target, int maxRounds, String label) {
        JSONObject o = new JSONObject();
        try {
            o.put("phase", phase);
            if (target > 0) o.put("target", target);
            if (maxRounds > 0) o.put("maxRounds", maxRounds);
            if (!label.isEmpty()) o.put("label", label);
        } catch (Exception ignored) { }
        return o;
    }

    private String normalizeUrl(String url) {
        try {
            Uri u = Uri.parse(url.trim());
            String host = u.getHost() == null ? "" : u.getHost().toLowerCase(java.util.Locale.ROOT);
            Matcher m = ASIN_IN_URL.matcher(u.getPath() == null ? "" : u.getPath());
            if (host.matches("(.+\\.)?amazon\\.[a-z.]+") && m.find()) {
                String h2 = host.startsWith("www.") ? host : "www." + host.replaceFirst("^(smile|m)\\.", "");
                return "https://" + h2 + "/dp/" + m.group(1).toUpperCase(java.util.Locale.ROOT);
            }
        } catch (Exception ignored) { }
        return url.trim();
    }

    /* ---------- Sichtbarer Amazon-Bereich ---------- */
    private void askUser(String text) {
        job.awaitingUser = true;
        paneText.setText(text);
        paneButton.setText("Abbrechen");
        worker.getSettings().setBlockNetworkImage(false);
        showPane();
    }

    private void onPaneButton() {
        if (loginMode) { closeLogin(); return; }
        if (job != null) cancelJob(true); else hidePane();
    }

    private void showPane() {
        pane.setVisibility(View.VISIBLE);
        ui.setVisibility(View.INVISIBLE);
        pane.bringToFront();
    }

    private void hidePane() {
        ui.setVisibility(View.VISIBLE);
        ui.bringToFront();
    }

    private void openLogin() {
        if (job != null) cancelJob(true);
        loginMode = true;
        paneText.setText("Melde dich bei Amazon an. Deine Zugangsdaten gehen direkt an Amazon – Rezi-Check behält nur die Anmelde-Cookies auf diesem Gerät.");
        paneButton.setText("Fertig");
        WebSettings s = worker.getSettings();
        s.setBlockNetworkImage(false);
        s.setUseWideViewPort(false);
        worker.loadUrl(DEFAULT_SIGNIN);
        showPane();
    }

    private void closeLogin() {
        loginMode = false;
        WebSettings s = worker.getSettings();
        s.setBlockNetworkImage(true);
        s.setUseWideViewPort(true);
        worker.stopLoading();
        worker.loadUrl("about:blank");
        CookieManager.getInstance().flush();
        hidePane();
        notifyLogin();
    }

    private void notifyLogin() {
        js("RC.onLoginState(" + isLoggedIn("https://www.amazon.de") + ")");
    }

    private boolean isLoggedIn(String origin) {
        String c = CookieManager.getInstance().getCookie(origin);
        return c != null && LOGIN_COOKIE.matcher(c).find();
    }

    /* ---------- Teilen-Ziel ---------- */
    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String text = null;
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text == null) text = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        } else if (Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) {
            text = intent.getDataString();
        }
        if (text == null || text.trim().isEmpty()) return;
        intent.setAction(Intent.ACTION_MAIN);   // nicht erneut auslösen (z. B. nach Drehen)
        if (uiReady) js("RC.onIncoming(" + JSONObject.quote(text) + ")");
        else pendingUrl = text;
    }

    /* ---------- Hilfen ---------- */
    private void progress(String text) {
        js("RC.onProgress(" + JSONObject.quote(text) + ")");
    }

    private void js(String code) {
        h.post(() -> ui.evaluateJavascript("try{" + code + "}catch(e){}", null));
    }

    private void openExternal(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Keine App zum Öffnen gefunden", Toast.LENGTH_SHORT).show();
        }
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            return bo.toString(StandardCharsets.UTF_8.name());
        } catch (Exception e) {
            return "";
        }
    }

    /* ---------- Brücke für die Oberfläche ---------- */
    private final class Bridge {
        @JavascriptInterface public void start(String url, String mode) { h.post(() -> startJob(url, mode)); }
        @JavascriptInterface public void cancel() { h.post(() -> cancelJob(false)); }
        @JavascriptInterface public void login() { h.post(MainActivity.this::openLogin); }
        @JavascriptInterface public void logout() {
            h.post(() -> CookieManager.getInstance().removeAllCookies(ok -> {
                CookieManager.getInstance().flush();
                notifyLogin();
            }));
        }
        @JavascriptInterface public boolean isLoggedIn() { return MainActivity.this.isLoggedIn("https://www.amazon.de"); }
        @JavascriptInterface public boolean isDark() { return isDarkMode(); }
        @JavascriptInterface public String appVersion() { return BuildConfig.VERSION_NAME; }
        @JavascriptInterface public void setCanGoBack(boolean b) { uiCanGoBack = b; }
        @JavascriptInterface public String getPendingUrl() {
            String p = pendingUrl;
            pendingUrl = null;
            return p;
        }
        @JavascriptInterface public String getPref(String key) { return prefs.getString("p_" + key, null); }
        @JavascriptInterface public void setPref(String key, String value) { prefs.edit().putString("p_" + key, value).apply(); }
        @JavascriptInterface public String paste() {
            ClipboardManager cb = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cb == null || !cb.hasPrimaryClip() || cb.getPrimaryClip() == null || cb.getPrimaryClip().getItemCount() == 0) return "";
            CharSequence t = cb.getPrimaryClip().getItemAt(0).coerceToText(MainActivity.this);
            return t == null ? "" : t.toString();
        }
        @JavascriptInterface public void copy(String text) {
            h.post(() -> {
                ClipboardManager cb = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (cb != null) cb.setPrimaryClip(ClipData.newPlainText("Rezi-Check", text));
                if (Build.VERSION.SDK_INT < 33) Toast.makeText(MainActivity.this, "Kopiert", Toast.LENGTH_SHORT).show();
            });
        }
        @JavascriptInterface public void open(String url) {
            if (url != null && url.startsWith("https://")) h.post(() -> openExternal(url));
        }
        @JavascriptInterface public void share(String text) {
            h.post(() -> {
                Intent s = new Intent(Intent.ACTION_SEND);
                s.setType("text/plain");
                s.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(s, "Ergebnis teilen"));
            });
        }
    }
}
