/* Rezi-Check – UI. Talks to the app via window.Android. */
(function () {
  'use strict';
  var A = window.Android;
  var I = window.RC_I18N;
  var t = I.t;
  var $ = function (id) { return document.getElementById(id); };
  var RC = window.RC = {};
  var REPO_URL = 'https://github.com/Silvertax/rezi-check';
  var ISSUES_URL = REPO_URL + '/issues';
  var state = {
    view: 'home', mode: 'quick', result: null, raw: null, diag: null, url: '', history: [],
    loggedIn: false, langPref: 'auto', store: 'amazon.de', lastError: null, lastCode: '', lastDetail: '', update: null
  };

  /* Amazon stores you can sign in to for “Thorough” */
  var STORES = ['amazon.de', 'amazon.com', 'amazon.co.uk', 'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.nl',
    'amazon.se', 'amazon.pl', 'amazon.com.be', 'amazon.ca', 'amazon.com.au', 'amazon.in'];
  var REGION_STORE = {
    DE: 'amazon.de', AT: 'amazon.de', CH: 'amazon.de', LI: 'amazon.de', LU: 'amazon.de',
    US: 'amazon.com', GB: 'amazon.co.uk', IE: 'amazon.co.uk', FR: 'amazon.fr', IT: 'amazon.it', ES: 'amazon.es',
    NL: 'amazon.nl', SE: 'amazon.se', PL: 'amazon.pl', BE: 'amazon.com.be', CA: 'amazon.ca', AU: 'amazon.com.au', IN: 'amazon.in'
  };
  var LANG_STORE = { de: 'amazon.de', fr: 'amazon.fr', it: 'amazon.it', es: 'amazon.es', nl: 'amazon.nl', sv: 'amazon.se', pl: 'amazon.pl' };

  /* ---------- Helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function call(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    try { if (A && typeof A[name] === 'function') return A[name].apply(A, args); } catch (e) { /* ignore */ }
    return null;
  }
  function stars(n) { n = Math.max(0, Math.min(5, Math.round(n || 0))); return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); }
  var GRADE_VAR = { A: '--g-a', B: '--g-b', C: '--g-c', D: '--g-d', F: '--g-f' };
  function gradeColor(g) { return 'var(' + (GRADE_VAR[g] || '--g-na') + ')'; }
  function gradeKey(g) { return GRADE_VAR[g] ? g : 'none'; }
  function storeName(s) { return 'Amazon.' + String(s || '').replace(/^amazon\./, ''); }

  function systemLocale() { return call('getSystemLocale') || navigator.language || 'de-DE'; }
  function systemLang() { return /^de\b/i.test(systemLocale()) ? 'de' : 'en'; }
  function effectiveLang() { return state.langPref === 'de' || state.langPref === 'en' ? state.langPref : systemLang(); }
  function defaultStore() {
    var parts = systemLocale().replace('_', '-').split('-');
    var region = (parts[1] || '').toUpperCase();
    return REGION_STORE[region] || LANG_STORE[(parts[0] || '').toLowerCase()] || 'amazon.com';
  }

  function findUrl(text) {
    text = String(text || '').trim();
    var m = text.match(/https?:\/\/[^\s"'<>]+/i);
    var url = m ? m[0] : null;
    if (!url) {
      var bare = text.match(/(?:^|\s)((?:www\.)?(?:amazon\.[a-z.]{2,6}|amzn\.(?:eu|to|com)|a\.co)\/[^\s"'<>]+)/i);
      if (bare) url = 'https://' + bare[1];
    }
    if (!url) {
      var asin = text.match(/^(B0[A-Z0-9]{8}|\d{9}[\dX])$/i);
      return asin ? 'https://www.' + state.store + '/dp/' + asin[1].toUpperCase() : null;
    }
    url = url.replace(/[).,;!?]+$/, '');
    try {
      var u = new URL(url);
      var host = u.hostname.toLowerCase();
      if (/(^|\.)amazon\.[a-z.]{2,6}$/.test(host) || /^(amzn\.(eu|to|com|asia)|a\.co)$/.test(host)) return u.href;
    } catch (e) { /* not a valid link */ }
    return null;
  }

  /* ---------- Page texts ---------- */
  function applyStatic() {
    var lang = effectiveLang();
    I.setLang(lang);
    document.documentElement.lang = lang;
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-html]'), function (el) { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-aria]'), function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
    $('link').placeholder = t('form.placeholder', { short: state.store === 'amazon.com' ? 'amzn.to/…' : 'amzn.eu/d/…', store: state.store });
    var sys = systemLang() === 'de' ? 'Deutsch' : 'English';
    $('langSel').options[0].textContent = t('settings.langAuto', { name: sys });
    $('langSel').value = state.langPref;
    $('storeSel').innerHTML = STORES.map(function (s) { return '<option value="' + s + '">' + esc(storeName(s)) + '</option>'; }).join('');
    $('storeSel').value = state.store;
    var v = call('appVersion');
    $('ver').textContent = v ? t('foot.version', { v: v }) : '';
    renderAccount();
  }

  /* ---------- Views ---------- */
  function show(view) {
    state.view = view;
    $('home').hidden = view !== 'home';
    $('settings').hidden = view !== 'settings';
    $('ask').hidden = view !== 'ask';
    $('tabs').hidden = !(view === 'home' || view === 'settings');
    if (view === 'home') $('tabHome').setAttribute('aria-current', 'page'); else $('tabHome').removeAttribute('aria-current');
    if (view === 'settings') $('tabSettings').setAttribute('aria-current', 'page'); else $('tabSettings').removeAttribute('aria-current');
    $('busy').hidden = view !== 'busy';
    $('result').hidden = view !== 'result';
    call('setCanGoBack', view !== 'home');
    window.scrollTo(0, 0);
  }

  function setError(err) {
    state.lastError = err || null;
    var box = $('error');
    if (!err) { box.hidden = true; box.innerHTML = ''; return; }
    var actions = err.actions || [];
    box.innerHTML = '<p class="alert__title">' + esc(t(err.title)) + '</p><p class="alert__text">' + esc(err.text ? t(err.text) : err.raw || '') + '</p>' +
      (actions.length ? '<div class="alert__actions">' + actions.map(function (a, i) {
        return '<button class="btn btn--quiet" type="button" data-i="' + i + '">' + esc(t(a.label)) + '</button>';
      }).join('') + '</div>' : '');
    actions.forEach(function (a, i) { box.querySelector('[data-i="' + i + '"]').addEventListener('click', a.run); });
    box.hidden = false;
  }

  function updateMode() {
    var el = document.querySelector('input[name="mode"]:checked');
    state.mode = el ? el.value : 'quick';
    var hint = t(state.mode === 'deep' ? 'hint.deep' : 'hint.quick');
    if (state.mode === 'deep' && !state.loggedIn) hint += t('hint.notLoggedIn', { store: storeName(state.store) });
    $('modeHint').textContent = hint;
    call('setPref', 'mode', state.mode);
  }

  function renderAccount() {
    state.loggedIn = !!call('loggedInFor', state.store);
    $('accText').textContent = t(state.loggedIn ? 'acc.on' : 'acc.off', { store: storeName(state.store) });
    $('accBtn').textContent = t(state.loggedIn ? 'acc.signOut' : 'acc.signIn');
    document.querySelector('.account').classList.toggle('account--on', state.loggedIn);
    updateMode();
  }

  /* ---------- History ---------- */
  function loadHistory() {
    try { state.history = JSON.parse(call('getPref', 'history') || '[]') || []; } catch (e) { state.history = []; }
  }
  function saveHistory() { call('setPref', 'history', JSON.stringify(state.history.slice(0, 30))); }
  function renderHistory() {
    var list = $('histList');
    var h = state.history;
    $('histEmpty').hidden = h.length > 0;
    $('histClear').hidden = h.length === 0;
    list.innerHTML = h.map(function (e, i) {
      return '<li><button class="history__item" type="button" data-i="' + i + '">' +
        '<span class="mini" style="color:' + gradeColor(e.grade) + '" aria-label="' + esc(t('res.gradeAria', { g: e.grade })) + '">' + esc(e.grade) + '</span>' +
        '<span class="history__title">' + esc(e.title || e.url) + '</span>' +
        '<span class="history__date">' + esc(I.formatDate(e.when)) + '</span></button></li>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('.history__item'), function (b) {
      b.addEventListener('click', function () {
        var e = state.history[+b.getAttribute('data-i')];
        if (!e || !e.result) return;
        state.raw = null; state.diag = null; state.url = e.url;
        renderResult(e.result);
      });
    });
  }
  function remember(res, url) {
    var key = res.product.asin || url;
    state.history = state.history.filter(function (e) { return (e.asin || e.url) !== key; });
    state.history.unshift({ when: res.when, grade: res.grade, title: res.product.title, url: url, asin: res.product.asin, result: res });
    saveHistory();
    renderHistory();
  }

  /* ---------- Start a check ---------- */
  function start(text, modeOverride) {
    setError(null);
    var url = findUrl(text);
    if (!url) {
      show('home');
      setError({ title: 'err.noUrl.t', text: 'err.noUrl.d' });
      return;
    }
    var mode = modeOverride || state.mode;
    if (mode === 'deep' && !state.loggedIn) {
      show('home');
      $('link').value = url;
      setError({ title: 'err.deepLogin.t', text: 'err.deepLogin.d', actions: [
        { label: 'err.signIn', run: function () { setError(null); call('loginTo', state.store); } },
        { label: 'err.quick', run: function () { start(url, 'quick'); } }
      ] });
      return;
    }
    state.url = url;
    state.raw = null; state.diag = null;
    $('link').value = url;
    $('busyText').textContent = t('busy.opening');
    show('busy');
    if (!A) return demo();
    call('start', url, mode);
  }

  /* A link shared from another app: ask for the depth first, or start right away (Settings → When sharing) */
  RC.onIncoming = function (text) {
    if (state.view === 'busy') call('cancel');
    var url = findUrl(text);
    if (!url || call('getPref', 'share') === 'direct') { start(text); return; }
    setError(null);
    state.askUrl = url;
    $('link').value = url;
    $('askLink').textContent = url.replace(/^https?:\/\/(www\.)?/, '');
    $('askDeepHint').textContent = t('hint.deep') + (state.loggedIn ? '' : t('hint.notLoggedIn', { store: storeName(state.store) }));
    show('ask');
  };
  function chooseMode(mode) {
    var r = document.querySelector('input[name="mode"][value="' + mode + '"]');
    if (r) { r.checked = true; updateMode(); }
    start(state.askUrl, mode);
  }
  RC.onProgress = function (txt) { if (txt) $('busyText').textContent = txt; };
  RC.onLoginState = function () { renderAccount(); };

  RC.onData = function (raw) {
    state.raw = raw;
    var res;
    try { res = window.RC_analyze(raw, Date.now()); } catch (e) {
      RC.onError('script', String(e && e.stack || e), raw);
      return;
    }
    if (!res.product.url) res.product.url = state.url;
    remember(res, state.url);
    renderResult(res);
  };

  var ERR_KEYS = { not_product: 1, load_failed: 1, timeout: 1, script: 1, captcha: 1, signin: 1 };
  RC.onError = function (code, detail, diag) {
    if (code === 'cancelled') { show('home'); return; }
    state.diag = diag || null;
    state.lastCode = code || ''; state.lastDetail = String(detail || '');
    show('home');
    var actions = [{ label: 'err.retry', run: function () { start(state.url); } }];
    if (diag || detail) actions.push({ label: 'err.copyDiag', run: copyDiag });
    if (code !== 'load_failed') actions.push({ label: 'err.report', run: reportProblem });
    if (code === 'signin') actions.unshift({ label: 'err.signIn', run: function () { setError(null); call('loginTo', state.store); } });
    if (ERR_KEYS[code]) setError({ title: 'err.' + code + '.t', text: 'err.' + code + '.d', actions: actions });
    else setError({ title: 'err.generic.t', raw: String(detail || t('err.unknown')), actions: actions });
  };

  function copyDiag() {
    var d = { app: call('appVersion'), lang: effectiveLang(), url: state.url, when: new Date().toISOString(), diag: state.diag };
    if (state.raw && state.raw.phases) {
      d.phases = {};
      Object.keys(state.raw.phases).forEach(function (k) {
        var p = state.raw.phases[k] || {};
        d.phases[k] = { ok: p.ok, blocks: p.blocks, error: p.error, reviews: (p.reviews || []).length, timing: p.timing, scriptMs: p.ms, product: p.product, diag: p.diag };
      });
      d.flags = state.raw.flags;
      d.timing = state.raw.timing;
    }
    var txt = JSON.stringify(d, null, 1);
    if (txt.length > 60000) txt = txt.slice(0, 60000);
    call('copy', txt);
  }

  /* Opens a pre-filled GitHub issue (compact facts only); the full diagnostics go to the clipboard.
     ctx: 'result' | 'error' | 'settings' */
  function reportProblem(ctx) {
    if (typeof ctx !== 'string') ctx = state.view === 'result' ? 'result' : 'error';
    var res = state.result, raw = state.raw;
    var lines = ['**What happened?**', '', '(please describe the problem here)', '', '**Diagnostics**',
      '- App: ' + (call('appVersion') || '?') + ' (' + effectiveLang() + ', ' + state.store + ')'];
    var product = state.url || (res && res.product && res.product.url);
    if (product) lines.push('- Product: ' + product);
    if (state.lastCode && ctx === 'error') lines.push('- Error: ' + state.lastCode + (state.lastDetail ? ' – ' + state.lastDetail.slice(0, 300) : ''));
    if (raw && raw.phases) {
      lines.push('- Mode: ' + (raw.mode || '?'));
      Object.keys(raw.phases).forEach(function (k) {
        var p = raw.phases[k] || {}, tm = p.timing || {};
        lines.push('- Phase ' + k + ': ok=' + !!p.ok + ', reviews=' + (p.reviews || []).length + ', blocks=' + JSON.stringify(p.blocks || {}) +
          (tm.pageMs != null ? ', page=' + tm.pageMs + 'ms, read=' + tm.readMs + 'ms' : '') + (p.error ? ', error=' + String(p.error).slice(0, 200) : ''));
      });
      if (raw.timing) lines.push('- Time: total ' + raw.timing.totalMs + 'ms' + (raw.timing.resolveMs >= 0 ? ', short link ' + raw.timing.resolveMs + 'ms' : ''));
      var pp = (raw.phases.product || {}).product || {};
      lines.push('- Found: title=' + !!pp.title + ', average=' + (pp.avg == null ? 'no' : 'yes') + ', total=' + (pp.total == null ? 'no' : 'yes') + ', histogram=' + !!pp.histogram + ', listed since=' + !!pp.firstAvailable);
      if (raw.flags && Object.keys(raw.flags).length) lines.push('- Flags: ' + JSON.stringify(raw.flags).slice(0, 300));
    }
    if (res && ctx === 'result') lines.push('- Result: grade ' + res.grade + ' (' + res.score + '), ' + res.reviewCount + ' reviews');
    var dg = state.diag && (state.diag.page || state.diag);
    if (dg && dg.counts) lines.push('- Page: ' + JSON.stringify(dg.counts) + ', title: ' + String(dg.title || '').slice(0, 80));
    var hasDiag = !!(raw || state.diag);
    if (hasDiag) lines.push('', 'The full diagnostics were copied to the clipboard – paste them below if needed.');
    var title = ctx === 'result' ? 'Problem with a result' : ctx === 'settings' ? 'Bug: ' : 'Problem: ' + (state.lastCode || 'check failed');
    if (hasDiag) copyDiag();
    call('open', ISSUES_URL + '/new?labels=bug&title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(lines.join('\n').slice(0, 3500)));
  }
  function requestFeature() {
    var body = ['**What would you like Rezi-Check to do?**', '', '', '**Why would that be useful?**', '', '',
      '_App: ' + (call('appVersion') || '?') + ' (' + effectiveLang() + ')_'].join('\n');
    call('open', ISSUES_URL + '/new?labels=enhancement&title=' + encodeURIComponent('Feature request: ') + '&body=' + encodeURIComponent(body));
  }

  /* ---------- Update notice (asks GitHub at most once a day; can be turned off) ---------- */
  function newer(a, b) {
    var x = String(a).replace(/^v/i, '').split('.'), y = String(b).replace(/^v/i, '').split('.');
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var p = parseInt(x[i] || '0', 10) || 0, q = parseInt(y[i] || '0', 10) || 0;
      if (p !== q) return p > q;
    }
    return false;
  }
  function updatesOn() { return call('getPref', 'updates') !== 'off'; }
  function renderUpdate() {
    var u = state.update, cur = call('appVersion') || '0';
    var showIt = !!u && updatesOn() && newer(u.tag, cur) && call('getPref', 'updateSkip') !== u.tag;
    $('update').hidden = !showIt;
    if (showIt) $('updateText').textContent = t('update.text', { v: String(u.tag).replace(/^v/i, '') });
  }
  function maybeCheckUpdate() {
    if (!updatesOn()) { renderUpdate(); return; }
    try { state.update = JSON.parse(call('getPref', 'updateInfo') || 'null'); } catch (e) { state.update = null; }
    renderUpdate();
    var last = parseInt(call('getPref', 'updateCheckedAt') || '0', 10) || 0;
    if (Date.now() - last > 20 * 3600 * 1000) {
      call('setPref', 'updateCheckedAt', String(Date.now()));
      call('checkUpdate');
    }
  }
  RC.onUpdateInfo = function (tag, url) {
    if (!tag || !/^v?\d+(\.\d+)*$/.test(tag)) return;
    state.update = { tag: tag, url: String(url || '').indexOf(REPO_URL + '/') === 0 ? url : REPO_URL + '/releases/latest' };
    call('setPref', 'updateInfo', JSON.stringify(state.update));
    renderUpdate();
  };

  /* ---------- Result (version 2 with text keys, version 1 with stored German text) ---------- */
  function isV2(res) { return (res.version || 1) >= 2; }
  function checkTitle(c) { return c.title || t('check.' + c.id + '.title'); }
  function checkText(c) { return c.text || (c.msgs || []).map(function (m) { return t(m.k, m.p); }).join(''); }
  function noteText(n) {
    if (n.text) return n.text;
    var p = n.p || {};
    if (p.codes) {
      return t(n.k, { list: p.codes.map(function (c) { return I.has('err.' + c) ? t('err.' + c) : c; }).join(' ') });
    }
    return t(n.k, p);
  }
  function labelOf(res) {
    var l = isV2(res) ? t('grade.' + gradeKey(res.grade) + '.label') : res.label;
    return res.preliminary ? l + ' (' + t('res.preliminary') + ')' : l;
  }

  function stampSvg(grade, when, preliminary) {
    var ring = t(preliminary ? 'stamp.ringPrelim' : 'stamp.ring', { date: I.formatDate(when) }).toUpperCase();
    return '<svg viewBox="0 0 120 120" aria-hidden="true"><defs><path id="ring" d="M60,60 m-48.5,0 a48.5,48.5 0 1,1 97,0 a48.5,48.5 0 1,1 -97,0"/></defs>' +
      '<g filter="url(#ink)">' +
      '<circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" stroke-width="4.5"/>' +
      '<circle cx="60" cy="60" r="41" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '<text font-family="Barlow Semi Condensed, sans-serif" font-weight="700" font-size="11.5" letter-spacing="1" fill="currentColor" textLength="296" lengthAdjust="spacing">' +
      '<textPath href="#ring">' + esc(ring) + '</textPath></text>' +
      '<text x="60" y="80" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="' + (grade === '?' ? 50 : 60) + '" fill="currentColor">' + esc(grade) + '</text>' +
      '</g></svg>';
  }

  var MARK = { bad: '✕', warn: '!', info: 'i', ok: '✓', na: '–' };
  function exampleHtml(x) {
    var meta = [];
    if (x.stars) meta.push(x.stars + ' ★');
    if (x.date) meta.push(I.formatDate(x.date));
    meta.push(x.vine ? t('ex.vine') : x.verified ? t('ex.verified') : t('ex.unverified'));
    var q = I.getLang() === 'de' ? ['„', '“'] : ['“', '”'];
    return '<li class="example"><p class="example__quote">' + q[0] + esc(x.quote || x.title || '') + q[1] + '</p>' +
      '<p class="example__meta">' + esc(meta.join(', ')) + '</p></li>';
  }
  function findingHtml(c) {
    var showEx = (c.level === 'bad' || c.level === 'warn' || c.level === 'info') && c.examples && c.examples.length;
    return '<div class="finding lvl-' + c.level + '">' +
      '<span class="mark' + (c.level === 'bad' ? ' mark--bad' : '') + '" aria-hidden="true">' + MARK[c.level] + '</span>' +
      '<p class="finding__title">' + esc(checkTitle(c)) + '</p>' +
      (c.penalty ? '<span class="finding__pts" aria-label="' + esc(t('res.penalty', { n: c.penalty })) + '">−' + c.penalty + '</span>' : '<span></span>') +
      '<p class="finding__text">' + esc(checkText(c)) + '</p>' +
      (showEx ? '<ul class="examples">' + c.examples.map(exampleHtml).join('') + '</ul>' : '') +
      '</div>';
  }

  function renderResult(res) {
    state.result = res;
    var v2 = isV2(res);
    var p = res.product;
    var g = res.grade;
    var issues = res.checks.filter(function (c) { return c.level === 'bad' || c.level === 'warn' || (c.level === 'info' && c.penalty > 0); });
    var infos = res.checks.filter(function (c) { return c.level === 'info' && !c.penalty; });
    var oks = res.checks.filter(function (c) { return c.level === 'ok'; });
    var nas = res.checks.filter(function (c) { return c.level === 'na'; });
    var order = { bad: 0, warn: 1, info: 2 };
    issues.sort(function (a, b) { return order[a.level] - order[b.level] || b.penalty - a.penalty; });

    var verdict = !v2 ? res.verdict : res.capped ? t(res.mode === 'deep' ? 'grade.cappedDeep.text' : 'grade.capped.text') : t('grade.' + gradeKey(g) + '.text');
    var confLevel = v2 ? t('conf.' + res.confidence) : res.confidence;
    var confText = v2 ? t(res.confMsg.k, res.confMsg.p) : res.confidenceText;

    var h = '';
    h += '<header class="report__head">' +
      (p.brand ? '<p class="report__brand">' + esc(p.brand) + '</p>' : '') +
      '<h1 class="report__title">' + esc(p.title || t('res.unknown')) + '</h1>' +
      (p.avg != null || p.total != null ? '<p class="report__rating"><span class="stars" aria-hidden="true">' + stars(p.avg) + '</span> ' +
        esc(t('res.rating', { avg: p.avg, total: p.total })) + '</p>' : '') +
      '</header>';
    h += '<div class="stamp" style="--grade:' + gradeColor(g) + '" role="img" aria-label="' + esc(t('res.gradeAria', { g: g })) + '">' + stampSvg(g, res.when, res.preliminary) + '</div>';
    h += '<section class="verdict" style="--grade:' + gradeColor(g) + '">' +
      '<p class="verdict__label">' + esc(labelOf(res)) + '</p>' +
      '<p class="verdict__text">' + esc(verdict) + '</p>' +
      '<p class="verdict__conf">' + (g !== '?' ? esc(t('res.points', { score: res.score })) : '') +
      esc(t('res.conf', { level: confLevel, text: confText })) + '</p></section>';

    if (res.notes && res.notes.length) {
      h += '<ul class="notes">' + res.notes.map(function (n) {
        return '<li class="note' + (n.level === 'warn' ? ' note--warn' : '') + '">' + esc(noteText(n)) + '</li>';
      }).join('') + '</ul>';
    }

    h += '<section class="block"><h2 class="block__title">' + esc(t('res.findings')) + '</h2>' +
      (issues.length ? issues.map(findingHtml).join('') : '<p class="finding__text" style="margin:0 0 10px">' + esc(t('res.none')) + '</p>') +
      '</section>';
    var calm = infos.concat(oks);
    if (calm.length) h += '<details class="group"><summary><span>' + esc(t('res.groupOk')) + ' <span class="group__count">' + calm.length + '</span></span></summary>' + calm.map(findingHtml).join('') + '</details>';
    if (nas.length) h += '<details class="group"><summary><span>' + esc(t('res.groupNa')) + ' <span class="group__count">' + nas.length + '</span></span></summary>' + nas.map(findingHtml).join('') + '</details>';

    if (p.histogram) {
      h += '<section class="block"><h2 class="block__title">' + esc(t('res.hist')) + '</h2><div class="hist">';
      for (var s = 5; s >= 1; s--) {
        var v = p.histogram[s] || 0;
        h += '<span class="hist__label">' + s + ' ★</span><span class="hist__track"><span class="hist__fill" style="display:block;width:' + v + '%"></span></span>' +
          '<span class="hist__val">' + v + (I.getLang() === 'de' ? ' %' : '%') + '</span>';
      }
      h += '</div>';
      if (res.adjusted) {
        var a = res.adjusted;
        var basis = v2 ? t('adj.basis.' + a.basis) : a.basis;
        h += '<p class="adj">' + t('res.adj_html', { clean: a.clean, all: a.all }) +
          '<small>' + esc(t('res.adjBasis', { nClean: a.nClean, nAll: a.nAll, basis: basis })) + '</small></p>';
      }
      h += '</section>';
    }

    h += '<section class="block"><h2 class="block__title">' + esc(t('res.critical')) + '</h2>';
    if (res.critical && res.critical.length) {
      h += res.critical.map(function (c) {
        var meta = [I.formatDate(c.date)];
        meta.push(c.verified ? t('ex.verified') : t('ex.unverified'));
        if (c.helpful) meta.push(t('voice.helpful', { n: c.helpful }));
        return '<div class="voice"><p class="voice__head"><span class="stars" aria-label="' + esc(t('stars.aria', { n: c.stars })) + '">' + stars(c.stars) + '</span>' + esc(c.title) + '</p>' +
          '<p class="voice__quote">' + esc(c.quote) + '</p><p class="voice__meta">' + esc(meta.filter(Boolean).join(', ')) + '</p></div>';
      }).join('');
    } else {
      h += '<p class="finding__text" style="margin:0 0 12px">' + esc(t('res.noCritical')) + '</p>';
    }
    h += '</section>';

    h += '<div class="actions"><button id="openAmz" class="btn btn--line" type="button">' + esc(t('res.open')) + '</button>' +
      '<button id="again" class="btn btn--primary" type="button">' + esc(t('res.again')) + '</button></div>';
    h += '<div class="small-actions">' + (state.raw || state.diag ? '<button id="diagBtn" class="btn btn--quiet" type="button">' + esc(t('res.diag')) + '</button>' +
      '<button id="reportBtn" class="btn btn--quiet" type="button">' + esc(t('err.report')) + '</button>' : '') + '</div>';
    h += '<p class="disclaimer">' + esc(t('res.disclaimer', { date: I.formatDate(res.when) })) + '</p>';

    var rep = $('report');
    rep.innerHTML = h;
    rep.style.setProperty('--grade', gradeColor(g));
    $('openAmz').addEventListener('click', function () { call('open', p.url || state.url); });
    $('again').addEventListener('click', function () { start(p.url || state.url); });
    var db = $('diagBtn'); if (db) db.addEventListener('click', copyDiag);
    var rb = $('reportBtn'); if (rb) rb.addEventListener('click', reportProblem);
    if (state.view !== 'result') show('result');
  }

  function shareText() {
    var r = state.result;
    if (!r) return '';
    var lines = [t('share.head', { g: r.grade, label: labelOf(r) }), r.product.title];
    var flagged = (r.warnings || []).map(function (w) { return isV2(r) ? t('check.' + w + '.title') : w; });
    if (flagged.length) lines.push(t('share.flagged', { list: flagged.join(', ') }));
    lines.push(r.product.url || state.url);
    lines.push(t('share.note'));
    return lines.filter(Boolean).join('\n');
  }

  RC.back = function () {
    if (state.view === 'busy') { call('cancel'); show('home'); return true; }
    if (state.view === 'result' || state.view === 'settings' || state.view === 'ask') { show('home'); return true; }
    return false;
  };

  /* ---------- Preview in a browser (without the app) ---------- */
  function demo() {
    if (window.__RC_DEMO) setTimeout(function () { RC.onData(window.__RC_DEMO); }, 300);
  }

  /* ---------- Settings ---------- */
  function onLanguageChange() {
    state.langPref = $('langSel').value;
    call('setPref', 'lang', state.langPref);
    applyStatic();
    renderHistory();
    if (state.lastError) setError(state.lastError);
    renderUpdate();
    if (state.view === 'result' && state.result) renderResult(state.result);
  }
  function onStoreChange() {
    state.store = $('storeSel').value;
    call('setPref', 'store', state.store);
    applyStatic();
  }

  /* ---------- Theme: like the phone, light or dark; OLED makes dark pure black ---------- */
  function themePref() { var v = call('getPref', 'theme'); return v === 'light' || v === 'dark' ? v : 'auto'; }
  function oledOn() { return call('getPref', 'oled') === 'on'; }
  function systemDark() {
    var d = call('isSystemDark');
    if (d === null) d = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return !!d;
  }
  function applyTheme() {
    var pref = themePref();
    var dark = pref === 'dark' || (pref === 'auto' && systemDark());
    var root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.classList.toggle('oled', dark && oledOn());
    // In the light theme the OLED switch has nothing to do.
    $('oledChk').disabled = !dark;
    $('oledRow').classList.toggle('setting--off', !dark);
    call('applyTheme', dark, dark && oledOn());
  }

  /* ---------- Start ---------- */
  function init() {
    $('themeSel').value = themePref();
    $('oledChk').checked = oledOn();
    applyTheme();

    var lp = call('getPref', 'lang');
    state.langPref = lp === 'de' || lp === 'en' ? lp : 'auto';
    var sp = call('getPref', 'store');
    state.store = STORES.indexOf(sp) >= 0 ? sp : defaultStore();

    var m = call('getPref', 'mode');
    if (m === 'deep' || m === 'quick') {
      var r = document.querySelector('input[name="mode"][value="' + m + '"]');
      if (r) r.checked = true;
    }
    applyStatic();
    loadHistory();
    renderHistory();

    Array.prototype.forEach.call(document.querySelectorAll('input[name="mode"]'), function (r) { r.addEventListener('change', updateMode); });
    $('go').addEventListener('click', function () { start($('link').value); });
    $('link').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); start($('link').value); } });
    $('paste').addEventListener('click', function () {
      var txt = call('paste');
      if (txt) { var u = findUrl(txt); $('link').value = u || txt; if (u) setError(null); }
    });
    $('cancel').addEventListener('click', function () { call('cancel'); show('home'); });
    $('accBtn').addEventListener('click', function () {
      if (state.loggedIn) { call('logout'); } else { call('loginTo', state.store); }
    });
    function toggleInfo(open) {
      $('accInfo').hidden = !open;
      $('accInfoBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    $('accInfoBtn').addEventListener('click', function () { toggleInfo($('accInfo').hidden); });
    $('accInfoClose').addEventListener('click', function () { toggleInfo(false); $('accInfoBtn').focus(); });
    $('histClear').addEventListener('click', function () { state.history = []; saveHistory(); renderHistory(); });
    $('back').addEventListener('click', function () { show('home'); });
    $('shareBtn').addEventListener('click', function () { call('share', shareText()); });
    $('langSel').addEventListener('change', onLanguageChange);
    $('storeSel').addEventListener('change', onStoreChange);
    $('updChk').checked = updatesOn();
    $('updChk').addEventListener('change', function () {
      call('setPref', 'updates', $('updChk').checked ? 'on' : 'off');
      if ($('updChk').checked) maybeCheckUpdate(); else renderUpdate();
    });
    $('updateGet').addEventListener('click', function () { if (state.update) call('open', state.update.url); });
    $('updateLater').addEventListener('click', function () { if (state.update) call('setPref', 'updateSkip', state.update.tag); renderUpdate(); });
    maybeCheckUpdate();

    $('tabHome').addEventListener('click', function () { show('home'); });
    $('tabSettings').addEventListener('click', function () { show('settings'); });
    $('themeSel').addEventListener('change', function () { call('setPref', 'theme', $('themeSel').value); applyTheme(); });
    $('oledChk').addEventListener('change', function () { call('setPref', 'oled', $('oledChk').checked ? 'on' : 'off'); applyTheme(); });
    $('shareSel').value = call('getPref', 'share') === 'direct' ? 'direct' : 'ask';
    $('shareSel').addEventListener('change', function () { call('setPref', 'share', $('shareSel').value); });
    $('fbFeature').addEventListener('click', requestFeature);
    $('fbBug').addEventListener('click', function () { reportProblem('settings'); });
    $('abGithub').addEventListener('click', function () { call('open', REPO_URL); });
    $('askQuick').addEventListener('click', function () { chooseMode('quick'); });
    $('askDeep').addEventListener('click', function () { chooseMode('deep'); });
    $('askCancel').addEventListener('click', function () { show('home'); });

    show('home');
    var pending = call('getPendingUrl');
    if (pending) RC.onIncoming(pending);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
