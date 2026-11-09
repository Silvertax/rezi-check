/* Rezi-Check – Oberfläche. Spricht über window.Android mit der App. */
(function () {
  'use strict';
  var A = window.Android;
  var $ = function (id) { return document.getElementById(id); };
  var RC = window.RC = {};
  var state = { view: 'home', mode: 'quick', result: null, raw: null, diag: null, url: '', history: [], loggedIn: false };

  /* ---------- Helfer ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function call(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    try { if (A && typeof A[name] === 'function') return A[name].apply(A, args); } catch (e) { /* ignorieren */ }
    return null;
  }
  function f1(x) { return x == null ? '–' : Number(x).toFixed(1).replace('.', ','); }
  function num(x) { return x == null ? '–' : Number(x).toLocaleString('de-DE'); }
  function dstr(iso) {
    if (!iso) return '';
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? (+m[3]) + '.' + (+m[2]) + '.' + m[1] : '';
  }
  function dnow(ms) { var d = new Date(ms); return d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear(); }
  function stars(n) { n = Math.max(0, Math.min(5, Math.round(n || 0))); return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); }
  var GRADE_VAR = { A: '--g-a', B: '--g-b', C: '--g-c', D: '--g-d', F: '--g-f' };
  function gradeColor(g) { return 'var(' + (GRADE_VAR[g] || '--g-na') + ')'; }

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
      return asin ? 'https://www.amazon.de/dp/' + asin[1].toUpperCase() : null;
    }
    url = url.replace(/[).,;!?]+$/, '');
    try {
      var u = new URL(url);
      var host = u.hostname.toLowerCase();
      if (/(^|\.)amazon\.[a-z.]{2,6}$/.test(host) || /^(amzn\.(eu|to|com|asia)|a\.co)$/.test(host)) return u.href;
    } catch (e) { /* kein gültiger Link */ }
    return null;
  }

  /* ---------- Ansichten ---------- */
  function show(view) {
    state.view = view;
    $('home').hidden = view !== 'home';
    $('busy').hidden = view !== 'busy';
    $('result').hidden = view !== 'result';
    call('setCanGoBack', view !== 'home');
    window.scrollTo(0, 0);
  }

  function setError(title, text, actions) {
    var box = $('error');
    if (!title) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML = '<p class="alert__title">' + esc(title) + '</p><p class="alert__text">' + esc(text) + '</p>' +
      (actions && actions.length ? '<div class="alert__actions">' + actions.map(function (a, i) {
        return '<button class="btn btn--quiet" type="button" data-i="' + i + '">' + esc(a.label) + '</button>';
      }).join('') + '</div>' : '');
    (actions || []).forEach(function (a, i) {
      box.querySelector('[data-i="' + i + '"]').addEventListener('click', a.run);
    });
    box.hidden = false;
  }

  var HINTS = {
    quick: 'Nur die Produktseite, ohne Anmeldung. Amazon zeigt dort rund 10 Rezensionen.',
    deep: 'Lädt zusätzlich bis zu 50 kritische und neueste Rezensionen. Dafür musst du in Rezi-Check bei Amazon angemeldet sein.'
  };
  function updateMode() {
    var el = document.querySelector('input[name="mode"]:checked');
    state.mode = el ? el.value : 'quick';
    var hint = HINTS[state.mode];
    if (state.mode === 'deep' && !state.loggedIn) hint += ' Du bist noch nicht angemeldet.';
    $('modeHint').textContent = hint;
    call('setPref', 'mode', state.mode);
  }

  function renderAccount() {
    $('accText').textContent = state.loggedIn ? 'Amazon: angemeldet' : 'Amazon: nicht angemeldet';
    $('accBtn').textContent = state.loggedIn ? 'Abmelden' : 'Anmelden';
    document.querySelector('.account').classList.toggle('account--on', state.loggedIn);
    updateMode();
  }

  /* ---------- Verlauf ---------- */
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
        '<span class="mini" style="color:' + gradeColor(e.grade) + '" aria-label="Note ' + esc(e.grade) + '">' + esc(e.grade) + '</span>' +
        '<span class="history__title">' + esc(e.title || e.url) + '</span>' +
        '<span class="history__date">' + esc(dnow(e.when)) + '</span></button></li>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('.history__item'), function (b) {
      b.addEventListener('click', function () {
        var e = state.history[+b.getAttribute('data-i')];
        if (!e) return;
        state.raw = null; state.diag = null; state.url = e.url;
        renderResult(e.result);
      });
    });
  }
  function remember(res, url) {
    var key = res.product.asin || url;
    state.history = state.history.filter(function (e) { return (e.asin || e.url) !== key; });
    state.history.unshift({ when: res.when, grade: res.grade, label: res.label, title: res.product.title, url: url, asin: res.product.asin, result: res });
    saveHistory();
    renderHistory();
  }

  /* ---------- Prüfung starten ---------- */
  function start(text, modeOverride) {
    setError(null);
    var url = findUrl(text);
    if (!url) {
      show('home');
      setError('Kein Amazon-Link erkannt', 'Kopiere den Link in der Amazon-App über „Teilen“ → „Link kopieren“ oder aus der Adresszeile des Browsers.');
      return;
    }
    var mode = modeOverride || state.mode;
    if (mode === 'deep' && !state.loggedIn) {
      show('home');
      $('link').value = url;
      setError('Für „Gründlich“ anmelden', 'Weitere Rezensionen zeigt Amazon nur angemeldeten Kunden. Melde dich einmalig in Rezi-Check an oder prüfe schnell ohne Anmeldung.', [
        { label: 'Anmelden', run: function () { setError(null); call('login'); } },
        { label: 'Schnell prüfen', run: function () { start(url, 'quick'); } }
      ]);
      return;
    }
    state.url = url;
    state.raw = null; state.diag = null;
    $('link').value = url;
    $('busyText').textContent = 'Öffne Amazon …';
    show('busy');
    if (!A) return demo();
    call('start', url, mode);
  }

  RC.onIncoming = function (text) {
    if (state.view === 'busy') call('cancel');
    start(text);
  };
  RC.onProgress = function (t) { if (t) $('busyText').textContent = t; };
  RC.onLoginState = function (on) { state.loggedIn = !!on; renderAccount(); };

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

  var ERRORS = {
    not_product: ['Das ist keine Produktseite', 'Unter dem Link wurde kein Amazon-Produkt gefunden. Öffne das Produkt in der Amazon-App und teile es von dort.'],
    load_failed: ['Amazon ist nicht erreichbar', 'Die Seite konnte nicht geladen werden. Prüfe deine Internetverbindung und versuch es erneut.'],
    timeout: ['Amazon hat zu lange gebraucht', 'Die Produktseite wurde nicht rechtzeitig fertig. Versuch es erneut – oft klappt es beim zweiten Mal.'],
    script: ['Auslesen fehlgeschlagen', 'Die Seite sah anders aus als erwartet. Kopiere die Diagnose und schick sie mir, dann passe ich Rezi-Check an.'],
    captcha: ['Sicherheitsabfrage nicht gelöst', 'Amazon wollte prüfen, ob du ein Mensch bist. Versuch es erneut und löse die Abfrage.'],
    signin: ['Amazon verlangt eine Anmeldung', 'Melde dich in Rezi-Check bei Amazon an und versuch es erneut.']
  };
  RC.onError = function (code, detail, diag) {
    if (code === 'cancelled') { show('home'); return; }
    state.diag = diag || null;
    var e = ERRORS[code] || ['Prüfung fehlgeschlagen', String(detail || 'Unbekannter Fehler.')];
    show('home');
    var actions = [{ label: 'Erneut versuchen', run: function () { start(state.url); } }];
    if (diag || detail) actions.push({ label: 'Diagnose kopieren', run: copyDiag });
    if (code === 'signin') actions.unshift({ label: 'Anmelden', run: function () { setError(null); call('login'); } });
    setError(e[0], e[1], actions);
  };

  function copyDiag() {
    var d = { app: call('appVersion'), url: state.url, when: new Date().toISOString(), diag: state.diag };
    if (state.raw && state.raw.phases) {
      d.phases = {};
      Object.keys(state.raw.phases).forEach(function (k) {
        var p = state.raw.phases[k] || {};
        d.phases[k] = { ok: p.ok, blocks: p.blocks, error: p.error, reviews: (p.reviews || []).length, product: p.product, diag: p.diag };
      });
      d.flags = state.raw.flags;
    }
    var txt = JSON.stringify(d, null, 1);
    if (txt.length > 60000) txt = txt.slice(0, 60000);
    call('copy', txt);
  }

  /* ---------- Ergebnis ---------- */
  function stampSvg(grade, when) {
    var ring = 'GEPRÜFT • ' + dnow(when) + ' • REZI-CHECK • ';
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
    if (x.date) meta.push(dstr(x.date));
    if (x.vine) meta.push('Vine'); else if (x.verified) meta.push('verifizierter Kauf'); else meta.push('nicht verifiziert');
    return '<li class="example"><p class="example__quote">„' + esc(x.quote || x.title || '') + '“</p>' +
      '<p class="example__meta">' + esc(meta.join(', ')) + '</p></li>';
  }
  function findingHtml(c) {
    var showEx = (c.level === 'bad' || c.level === 'warn' || c.level === 'info') && c.examples && c.examples.length;
    return '<div class="finding lvl-' + c.level + '">' +
      '<span class="mark' + (c.level === 'bad' ? ' mark--bad' : '') + '" aria-hidden="true">' + MARK[c.level] + '</span>' +
      '<p class="finding__title">' + esc(c.title) + '</p>' +
      (c.penalty ? '<span class="finding__pts" aria-label="' + c.penalty + ' Punkte Abzug">−' + c.penalty + '</span>' : '<span></span>') +
      '<p class="finding__text">' + esc(c.text) + '</p>' +
      (showEx ? '<ul class="examples">' + c.examples.map(exampleHtml).join('') + '</ul>' : '') +
      '</div>';
  }

  function renderResult(res) {
    state.result = res;
    var p = res.product;
    var g = res.grade;
    var issues = res.checks.filter(function (c) { return c.level === 'bad' || c.level === 'warn' || c.level === 'info' && c.penalty > 0; });
    var infos = res.checks.filter(function (c) { return c.level === 'info' && !c.penalty; });
    var oks = res.checks.filter(function (c) { return c.level === 'ok'; });
    var nas = res.checks.filter(function (c) { return c.level === 'na'; });
    var order = { bad: 0, warn: 1, info: 2 };
    issues.sort(function (a, b) { return order[a.level] - order[b.level] || b.penalty - a.penalty; });

    var h = '';
    h += '<header class="report__head">' +
      (p.brand ? '<p class="report__brand">' + esc(p.brand) + '</p>' : '') +
      '<h1 class="report__title">' + esc(p.title || 'Unbekanntes Produkt') + '</h1>' +
      (p.avg != null || p.total != null ? '<p class="report__rating"><span class="stars" aria-hidden="true">' + stars(p.avg) + '</span> ' +
        esc(f1(p.avg)) + ' von 5, ' + esc(num(p.total)) + ' Bewertungen</p>' : '') +
      '</header>';
    h += '<div class="stamp" style="--grade:' + gradeColor(g) + '" role="img" aria-label="Note ' + esc(g) + '">' + stampSvg(g, res.when) + '</div>';
    h += '<section class="verdict" style="--grade:' + gradeColor(g) + '">' +
      '<p class="verdict__label">' + esc(res.label) + '</p>' +
      '<p class="verdict__text">' + esc(res.verdict) + '</p>' +
      '<p class="verdict__conf">' + (g !== '?' ? esc(res.score) + ' von 100 Punkten. ' : '') +
      'Aussagekraft ' + esc(res.confidence) + ': ' + esc(res.confidenceText) + '</p></section>';

    if (res.notes && res.notes.length) {
      h += '<ul class="notes">' + res.notes.map(function (n) {
        return '<li class="note' + (n.level === 'warn' ? ' note--warn' : '') + '">' + esc(n.text) + '</li>';
      }).join('') + '</ul>';
    }

    h += '<section class="block"><h2 class="block__title">Befunde</h2>' +
      (issues.length ? issues.map(findingHtml).join('') : '<p class="finding__text" style="margin:0 0 10px">Keine Auffälligkeiten gefunden.</p>') +
      '</section>';
    var calm = infos.concat(oks);
    if (calm.length) h += '<details class="group"><summary><span>Unauffällig <span class="group__count">' + calm.length + '</span></span></summary>' + calm.map(findingHtml).join('') + '</details>';
    if (nas.length) h += '<details class="group"><summary><span>Nicht geprüft <span class="group__count">' + nas.length + '</span></span></summary>' + nas.map(findingHtml).join('') + '</details>';

    if (p.histogram) {
      h += '<section class="block"><h2 class="block__title">Sterneverteilung</h2><div class="hist">';
      for (var s = 5; s >= 1; s--) {
        var v = p.histogram[s] || 0;
        h += '<span class="hist__label">' + s + ' ★</span><span class="hist__track"><span class="hist__fill" style="display:block;width:' + v + '%"></span></span><span class="hist__val">' + v + ' %</span>';
      }
      h += '</div>';
      if (res.adjusted) {
        var a = res.adjusted;
        h += '<p class="adj">Ohne auffällige Rezensionen: <b>' + f1(a.clean) + ' ★</b> statt ' + f1(a.all) + ' ★' +
          '<small>Grundlage: ' + a.nClean + ' von ' + a.nAll + ' ' + esc(a.basis) + ' (verifiziert, kein Vine, kein Gratis-Hinweis, keine Kopie).</small></p>';
      }
      h += '</section>';
    }

    h += '<section class="block"><h2 class="block__title">Kritische Stimmen</h2>';
    if (res.critical && res.critical.length) {
      h += res.critical.map(function (c) {
        var meta = [dstr(c.date)];
        meta.push(c.verified ? 'verifizierter Kauf' : 'nicht verifiziert');
        if (c.helpful) meta.push(c.helpful + '× hilfreich');
        return '<div class="voice"><p class="voice__head"><span class="stars" aria-label="' + c.stars + ' Sterne">' + stars(c.stars) + '</span>' + esc(c.title) + '</p>' +
          '<p class="voice__quote">' + esc(c.quote) + '</p><p class="voice__meta">' + esc(meta.filter(Boolean).join(', ')) + '</p></div>';
      }).join('');
    } else {
      h += '<p class="finding__text" style="margin:0 0 12px">Keine Rezension mit 1 oder 2 Sternen in der Stichprobe.</p>';
    }
    h += '</section>';

    h += '<div class="actions"><button id="openAmz" class="btn btn--line" type="button">Bei Amazon öffnen</button>' +
      '<button id="again" class="btn btn--primary" type="button">Erneut prüfen</button></div>';
    h += '<div class="small-actions">' + (state.raw || state.diag ? '<button id="diagBtn" class="btn btn--quiet" type="button">Diagnose kopieren</button>' : '') + '</div>';
    h += '<p class="disclaimer">Rezi-Check sucht nach typischen Mustern gefälschter Bewertungen. Das ist eine Einschätzung, kein Beweis. Geprüft am ' + esc(dnow(res.when)) + '.</p>';

    var rep = $('report');
    rep.innerHTML = h;
    rep.style.setProperty('--grade', gradeColor(g));
    $('openAmz').addEventListener('click', function () { call('open', p.url || state.url); });
    $('again').addEventListener('click', function () { start(p.url || state.url); });
    var db = $('diagBtn'); if (db) db.addEventListener('click', copyDiag);
    show('result');
  }

  function shareText() {
    var r = state.result;
    if (!r) return '';
    var lines = ['Rezi-Check: Note ' + r.grade + ' – ' + r.label, r.product.title];
    if (r.warnings && r.warnings.length) lines.push('Auffällig: ' + r.warnings.join(', '));
    lines.push(r.product.url || state.url);
    lines.push('(Einschätzung anhand typischer Fake-Muster, kein Beweis.)');
    return lines.filter(Boolean).join('\n');
  }

  RC.back = function () {
    if (state.view === 'busy') { call('cancel'); show('home'); return true; }
    if (state.view === 'result') { show('home'); return true; }
    return false;
  };

  /* ---------- Vorschau im Browser (ohne App) ---------- */
  function demo() {
    if (window.__RC_DEMO) setTimeout(function () { RC.onData(window.__RC_DEMO); }, 300);
  }

  /* ---------- Start ---------- */
  function init() {
    var dark = call('isDark');
    if (dark === null) dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', !!dark);

    var m = call('getPref', 'mode');
    if (m === 'deep' || m === 'quick') {
      var r = document.querySelector('input[name="mode"][value="' + m + '"]');
      if (r) r.checked = true;
    }
    state.loggedIn = !!call('isLoggedIn');
    renderAccount();
    loadHistory();
    renderHistory();
    var v = call('appVersion');
    $('ver').textContent = v ? 'Version ' + v : '';

    Array.prototype.forEach.call(document.querySelectorAll('input[name="mode"]'), function (r) { r.addEventListener('change', updateMode); });
    $('go').addEventListener('click', function () { start($('link').value); });
    $('link').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); start($('link').value); } });
    $('paste').addEventListener('click', function () {
      var t = call('paste');
      if (t) { var u = findUrl(t); $('link').value = u || t; if (u) setError(null); }
    });
    $('cancel').addEventListener('click', function () { call('cancel'); show('home'); });
    $('accBtn').addEventListener('click', function () {
      if (state.loggedIn) { call('logout'); } else { call('login'); }
    });
    $('histClear').addEventListener('click', function () { state.history = []; saveHistory(); renderHistory(); });
    $('back').addEventListener('click', function () { show('home'); });
    $('shareBtn').addEventListener('click', function () { call('share', shareText()); });

    show('home');
    var pending = call('getPendingUrl');
    if (pending) start(pending);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
