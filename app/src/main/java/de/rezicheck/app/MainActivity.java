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
import android.content.res.Resources;
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
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.List;
import java.util.Random;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Rezi-Check: UI (local HTML) + hidden Amazon WebView that loads the product
 * page and reads it with a script. Everything stays on the device.
 */
public class MainActivity extends Activity {

    private static final String UI_URL = "file:///android_asset/ui/index.html";
    /** OpenID handles of the Amazon stores for the sign-in page; other stores reach sign-in via the order history. */
    private static final Map<String, String> SIGNIN_HANDLE = new HashMap<>();
    static {
        SIGNIN_HANDLE.put("amazon.de", "deflex");
        SIGNIN_HANDLE.put("amazon.com", "usflex");
        SIGNIN_HANDLE.put("amazon.co.uk", "gbflex");
        SIGNIN_HANDLE.put("amazon.fr", "frflex");
        SIGNIN_HANDLE.put("amazon.it", "itflex");
        SIGNIN_HANDLE.put("amazon.es", "esflex");
        SIGNIN_HANDLE.put("amazon.ca", "caflex");
        SIGNIN_HANDLE.put("amazon.com.au", "auflex");
        SIGNIN_HANDLE.put("amazon.in", "inflex");
    }
    private static final Pattern STORE_HOST = Pattern.compile("amazon\\.[a-z]{2,3}(\\.[a-z]{2})?");
    private static final String LATEST_RELEASE_API = "https://api.github.com/repos/Silvertax/rezi-check/releases/latest";
    private static final Pattern SHORT_HOST = Pattern.compile("amzn\\.(eu|to|com|asia)|a\\.co");
    private static final Pattern ASIN_IN_URL =
            Pattern.compile("/(?:dp|gp/product|gp/aw/d|product-reviews)/([A-Z0-9]{10})", Pattern.CASE_INSENSITIVE);
    private static final Pattern LOGIN_COOKIE = Pattern.compile("(?:^|;\\s*)(?:sess-)?at-[a-z]+=");

    private final Handler h = new Handler(Looper.getMainLooper());
    private final Random rnd = new Random();

    private FrameLayout root;
    private WebView ui;
    private WebView worker;
    private LinearLayout pane;       // visible Amazon area (sign-in / security check)
    private TextView paneText;
    private LinearLayout paneBar;    // bar above the Amazon area
    private Button paneButton;

    private String extractJs;
    private String desktopUa;
    private boolean uiReady;
    private volatile String pendingUrl;
    private volatile boolean uiCanGoBack;
    private boolean loginMode;
    private SharedPreferences prefs;
    private String resLang;
    private Resources langRes;

    private Job job;

    /* ---------- Check job ---------- */
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
        boolean injected, awaitingUser, finished, loadIssued, pageStarted;
        long tStart, tLoad, tInject, resolveMs = -1;
        int pageSeq, askedSeq = -1;
        int pollToken, interactions;
        String lastProgress = "";
        JSONObject lastDiag;
        Phase current() { return idx >= 0 && idx < phases.size() ? phases.get(idx) : null; }
    }

    /* ---------- Lifecycle ---------- */
    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("rezicheck", MODE_PRIVATE);
        extractJs = readAsset("extract.js");
        boolean dark = isDarkMode();
        boolean oled = dark && "on".equals(prefs.getString("p_oled", null));

        root = new FrameLayout(this);
        setContentView(root);
        setupInsets();

        // Amazon WebView (sits underneath the UI)
        pane = new LinearLayout(this);
        pane.setOrientation(LinearLayout.VERTICAL);
        LinearLayout bar = paneBar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        int p = dp(12);
        bar.setPadding(dp(16), p, dp(8), p);
        paneText = new TextView(this);
        paneText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        bar.addView(paneText, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        paneButton = new Button(this);
        paneButton.setAllCaps(false);
        paneButton.setText(s(R.string.btn_done));
        paneButton.setOnClickListener(v -> onPaneButton());
        bar.addView(paneButton, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        pane.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        worker = new WebView(this);
        setupWorker();
        pane.addView(worker, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        root.addView(pane, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // UI
        ui = new WebView(this);
        applyLook(dark, oled);
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

    /* ---------- System bars (edge-to-edge from Android 15) ---------- */
    @SuppressWarnings("deprecation")
    private void setupInsets() {
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
    }

    /* ---------- Look: light, dark or OLED black (the page sends the choice) ---------- */
    @SuppressWarnings("deprecation")
    private void applyLook(boolean dark, boolean oled) {
        int bg = oled ? Color.BLACK : dark ? Color.parseColor("#101319") : Color.parseColor("#F3F5FA");
        getWindow().getDecorView().setBackgroundColor(bg);
        root.setBackgroundColor(bg);
        pane.setBackgroundColor(bg);
        if (ui != null) ui.setBackgroundColor(bg);
        paneBar.setBackgroundColor(oled ? Color.BLACK : dark ? Color.parseColor("#1A1E27") : Color.WHITE);
        paneText.setTextColor(dark ? Color.parseColor("#E7ECF6") : Color.parseColor("#16233F"));
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(dark ? 0 : mask, mask);
            }
        } else {
            int flags = getWindow().getDecorView().getSystemUiVisibility();
            int light = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            flags = dark ? flags & ~light : flags | light;
            getWindow().getDecorView().setSystemUiVisibility(flags);
        }
        if (Build.VERSION.SDK_INT < 35) {
            getWindow().setStatusBarColor(bg);
            getWindow().setNavigationBarColor(bg);
        }
    }

    private boolean isSystemDark() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    /** The chosen theme (Settings → Theme), otherwise the phone's. */
    private boolean isDarkMode() {
        String theme = prefs.getString("p_theme", null);
        if ("light".equals(theme)) return false;
        if ("dark".equals(theme)) return true;
        return isSystemDark();
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
        // Desktop layout: more stable structure, includes star distribution + reviews
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
                    if (job.loadIssued) job.pageStarted = true;
                    job.pageSeq++;
                    h.removeCallbacks(injectRunnable);
                }
            }
            @Override
            public void onPageCommitVisible(WebView view, String url) {
                // Start reading as soon as the page shows up instead of waiting for every last resource;
                // the script itself waits for the parts it needs.
                if (loginMode || job == null || job.finished || url == null || url.startsWith("about:")) return;
                h.removeCallbacks(injectRunnable);
                h.postDelayed(injectRunnable, 250);
            }
            @Override
            public void onPageFinished(WebView view, String url) {
                if (loginMode) { notifyLogin(); return; }
                if (job == null || job.finished || url == null || url.startsWith("about:")) return;
                h.removeCallbacks(injectRunnable);
                h.postDelayed(injectRunnable, 300);
            }
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame() || job == null || job.finished || job.awaitingUser) return;
                Phase ph = job.current();
                String msg = String.valueOf(error.getDescription());
                if (ph != null && "product".equals(ph.name)) {
                    fail("load_failed", msg);
                } else {
                    job.errors.put("reviews_load_failed");
                    nextPhase();
                }
            }
        });
    }

    private final Runnable injectRunnable = this::inject;

    private void inject() {
        if (job == null || job.finished || job.injected || !job.loadIssued || !job.pageStarted) return;
        if (job.awaitingUser && job.askedSeq == job.pageSeq) return;   // same page the user is still working on
        Phase ph = job.current();
        if (ph == null) return;
        job.injected = true;
        job.tInject = System.currentTimeMillis();
        final int token = ++job.pollToken;
        String code = "window.__RC_OPTS=" + ph.opts.toString() + ";\n" + extractJs;
        worker.evaluateJavascript(code, null);
        h.postDelayed(() -> poll(token), 300);
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
            } catch (Exception ignored) { /* keep polling */ }
            h.postDelayed(() -> poll(token), 300);
        });
    }

    /* ---------- Flow ---------- */
    private void startJob(String url, String mode) {
        if (job != null) cancelJob(false);
        if (loginMode) closeLogin();
        final Job j = new Job();
        job = j;
        j.tStart = System.currentTimeMillis();
        j.mode = "deep".equals(mode) ? "deep" : "quick";
        worker.getSettings().setBlockNetworkImage(true);
        worker.getSettings().setUseWideViewPort(true);
        hidePane();
        progress(s(R.string.progress_open));
        final String in = url == null ? "" : url.trim();
        if (isShortLink(in)) {
            // Shared links are short links (amzn.eu/…): resolve them first, then load the product page directly
            new Thread(() -> {
                long t0 = System.currentTimeMillis();
                String resolved = resolveShortLink(in);
                long ms = System.currentTimeMillis() - t0;
                h.post(() -> {
                    if (job != j || j.finished) return;
                    j.resolveMs = ms;
                    beginJob(j, resolved != null ? resolved : in);
                });
            }).start();
        } else {
            beginJob(j, in);
        }
    }

    private void beginJob(Job j, String url) {
        j.url = normalizeUrl(url);
        j.phases.add(new Phase("product", j.url, s(R.string.phase_product), opts("product", 0, 0, ""), 60000));
        nextPhase();
    }

    private static boolean isShortLink(String url) {
        try {
            String host = Uri.parse(url).getHost();
            return host != null && SHORT_HOST.matcher(host.toLowerCase(Locale.ROOT)).matches();
        } catch (Exception e) {
            return false;
        }
    }

    /** Follows the redirects of an Amazon short link without loading any page. Returns null if that fails. */
    private String resolveShortLink(String url) {
        String cur = url;
        try {
            for (int i = 0; i < 5; i++) {
                HttpURLConnection c = (HttpURLConnection) new URL(cur).openConnection();
                try {
                    c.setInstanceFollowRedirects(false);
                    c.setConnectTimeout(5000);
                    c.setReadTimeout(5000);
                    c.setRequestMethod("GET");
                    c.setRequestProperty("User-Agent", desktopUa);
                    int code = c.getResponseCode();
                    String loc = c.getHeaderField("Location");
                    if (code < 300 || code >= 400 || loc == null) return null;
                    cur = new URL(new URL(cur), loc).toString();
                } finally {
                    c.disconnect();
                }
                Uri u = Uri.parse(cur);
                String host = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT);
                if (!"https".equals(u.getScheme())) return null;
                if (host.matches("(.+\\.)?amazon\\.[a-z.]+")) {
                    return ASIN_IN_URL.matcher(u.getPath() == null ? "" : u.getPath()).find() ? cur : null;
                }
                if (!SHORT_HOST.matcher(host).matches()) return null;
            }
        } catch (Exception ignored) {
            /* fall back to loading the short link in the WebView */
        }
        return null;
    }

    private void nextPhase() {
        if (job == null || job.finished) return;
        job.idx++;
        Phase ph = job.current();
        if (ph == null) { finishJob(); return; }
        job.injected = false;
        job.awaitingUser = false;
        job.loadIssued = false;
        job.pageStarted = false;
        job.pollToken++;
        final Job j = job;
        final Phase phase = ph;
        long delay = job.idx == 0 ? 0 : 1500 + rnd.nextInt(1500);
        h.postDelayed(() -> {
            if (job != j || j.finished) return;
            progress(phase.label + " …");
            j.loadIssued = true;
            j.tLoad = System.currentTimeMillis();
            worker.loadUrl(phase.url);
            scheduleTimeout(j, j.idx, phase.timeoutMs);
        }, delay);
    }

    private void scheduleTimeout(final Job j, final int idx, long ms) {
        h.postDelayed(() -> {
            if (job != j || j.finished || j.idx != idx) return;
            if (j.awaitingUser) { scheduleTimeout(j, idx, 15000); return; }   // user is solving something
            Phase ph = j.current();
            if (ph != null && "product".equals(ph.name)) {
                fail("timeout", "timeout");
            } else {
                j.errors.put("reviews_timeout");
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
        try {
            long now = System.currentTimeMillis();
            JSONObject tm = new JSONObject();
            tm.put("pageMs", job.tInject - job.tLoad);
            tm.put("readMs", now - job.tInject);
            tm.put("sinceStartMs", now - job.tStart);
            r.put("timing", tm);
        } catch (Exception ignored) { }

        if (blocks.optBoolean("captcha") || ("product".equals(ph.name) && blocks.optBoolean("signin"))) {
            job.interactions++;
            if (job.interactions > 4) { fail(blocks.optBoolean("captcha") ? "captcha" : "signin", ""); return; }
            askUser(s(blocks.optBoolean("captcha") ? R.string.pane_captcha : R.string.pane_signin));
            job.injected = false;   // after solving, the next page load is read again
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
                                s(R.string.phase_critical), opts("critical", 20, 2, s(R.string.label_critical)), 90000));
                        job.phases.add(new Phase("recent", base + "&filterByStar=all_stars&sortBy=recent&pageNumber=1",
                                s(R.string.phase_recent), opts("recent", 30, 3, s(R.string.label_recent)), 90000));
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
                    job.errors.put("reviews_script");
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
            JSONObject tm = new JSONObject();
            tm.put("totalMs", System.currentTimeMillis() - job.tStart);
            tm.put("resolveMs", job.resolveMs);
            out.put("timing", tm);
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
            o.put("lang", lang());
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

    /* ---------- Visible Amazon area ---------- */
    private void askUser(String text) {
        job.awaitingUser = true;
        job.askedSeq = job.pageSeq;
        paneText.setText(text);
        paneButton.setText(s(R.string.btn_cancel));
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

    private void openLogin(String store) {
        if (job != null) cancelJob(true);
        loginMode = true;
        paneText.setText(s(R.string.pane_login));
        paneButton.setText(s(R.string.btn_done));
        WebSettings ws = worker.getSettings();
        ws.setBlockNetworkImage(false);
        ws.setUseWideViewPort(false);
        worker.loadUrl(signInUrl(store));
        showPane();
    }

    private static String cleanStore(String store) {
        String st = store == null ? "" : store.toLowerCase(Locale.ROOT).replaceFirst("^www\\.", "");
        return STORE_HOST.matcher(st).matches() ? st : "amazon.de";
    }

    private static String signInUrl(String store) {
        String st = cleanStore(store);
        String base = "https://www." + st;
        String handle = SIGNIN_HANDLE.get(st);
        if (handle == null) return base + "/gp/css/order-history";   // redirects to sign-in
        String enc = Uri.encode(base + "/");
        String id = "http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select";
        return base + "/ap/signin?openid.pape.max_auth_age=0&openid.return_to=" + enc
                + "&openid.identity=" + id + "&openid.assoc_handle=" + handle + "&openid.mode=checkid_setup"
                + "&openid.claimed_id=" + id + "&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0";
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
        js("RC.onLoginState()");
    }

    private boolean isLoggedIn(String origin) {
        String c = CookieManager.getInstance().getCookie(origin);
        return c != null && LOGIN_COOKIE.matcher(c).find();
    }

    /* ---------- Share target ---------- */
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
        intent.setAction(Intent.ACTION_MAIN);   // don't trigger again (e.g. after rotation)
        if (uiReady) js("RC.onIncoming(" + JSONObject.quote(text) + ")");
        else pendingUrl = text;
    }

    /* ---------- Language ---------- */
    private String systemLocale() {
        return getResources().getConfiguration().getLocales().get(0).toLanguageTag();
    }

    private String lang() {
        String p = prefs.getString("p_lang", "auto");
        if ("de".equals(p) || "en".equals(p)) return p;
        return systemLocale().toLowerCase(Locale.ROOT).startsWith("de") ? "de" : "en";
    }

    private String s(int id) {
        String l = lang();
        if (langRes == null || !l.equals(resLang)) {
            Configuration c = new Configuration(getResources().getConfiguration());
            c.setLocale(Locale.forLanguageTag(l));
            langRes = createConfigurationContext(c).getResources();
            resLang = l;
        }
        return langRes.getString(id);
    }

    /* ---------- Helpers ---------- */
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
            Toast.makeText(this, s(R.string.toast_no_app), Toast.LENGTH_SHORT).show();
        }
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    /** Asks GitHub for the latest release (no personal data is sent); the UI decides whether to show a notice. */
    private void fetchLatestRelease() {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(LATEST_RELEASE_API).openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            c.setRequestProperty("Accept", "application/vnd.github+json");
            c.setRequestProperty("User-Agent", "Rezi-Check/" + BuildConfig.VERSION_NAME);
            if (c.getResponseCode() != 200) return;
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            try (InputStream in = c.getInputStream()) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0 && bo.size() < 2_000_000) bo.write(buf, 0, n);
            }
            JSONObject o = new JSONObject(bo.toString(StandardCharsets.UTF_8.name()));
            String tag = o.optString("tag_name", "");
            String url = o.optString("html_url", "");
            if (!tag.isEmpty()) js("RC.onUpdateInfo(" + JSONObject.quote(tag) + "," + JSONObject.quote(url) + ")");
        } catch (Exception ignored) {
            /* offline or GitHub unreachable: try again another day */
        } finally {
            if (c != null) c.disconnect();
        }
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

    /* ---------- Bridge for the UI ---------- */
    private final class Bridge {
        @JavascriptInterface public void start(String url, String mode) { h.post(() -> startJob(url, mode)); }
        @JavascriptInterface public void checkUpdate() { new Thread(MainActivity.this::fetchLatestRelease).start(); }
        @JavascriptInterface public void cancel() { h.post(() -> cancelJob(false)); }
        @JavascriptInterface public void loginTo(String store) { h.post(() -> openLogin(store)); }
        @JavascriptInterface public void logout() {
            h.post(() -> CookieManager.getInstance().removeAllCookies(ok -> {
                CookieManager.getInstance().flush();
                notifyLogin();
            }));
        }
        @JavascriptInterface public boolean loggedInFor(String store) { return isLoggedIn("https://www." + cleanStore(store)); }
        @JavascriptInterface public String getSystemLocale() { return systemLocale(); }
        @JavascriptInterface public boolean isDark() { return isDarkMode(); }
        @JavascriptInterface public boolean isSystemDark() { return MainActivity.this.isSystemDark(); }
        @JavascriptInterface public void applyTheme(boolean dark, boolean oled) { h.post(() -> applyLook(dark, oled)); }
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
                if (Build.VERSION.SDK_INT < 33) Toast.makeText(MainActivity.this, s(R.string.toast_copied), Toast.LENGTH_SHORT).show();
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
                startActivity(Intent.createChooser(s, s(R.string.share_title)));
            });
        }
    }
}
