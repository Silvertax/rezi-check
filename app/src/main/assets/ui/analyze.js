/*
 * Rezi-Check – analysis of the extracted Amazon data.
 * analyze(raw, nowMs) -> { grade, score, checks[], ... } – texts as keys for i18n.js
 * Pure heuristics: provides indications, not proof.
 */
(function (root) {
  'use strict';
  var DAY = 86400000;

  /* ---------- Helpers ---------- */
  function wc(s) { s = (s || '').trim(); return s ? s.split(/\s+/).length : 0; }
  function toks(s) { return (s || '').toLowerCase().replace(/[^a-z0-9äöüßéèêàâîôûçñ]+/g, ' ').trim().split(' ').filter(Boolean); }
  function ngrams(t, n) { var s = new Set(); for (var i = 0; i + n <= t.length; i++) s.add(t.slice(i, i + n).join(' ')); return s; }
  function inter(a, b) { var c = 0; a.forEach(function (x) { if (b.has(x)) c++; }); return c; }
  function jaccard(a, b) { var i = inter(a, b); var u = a.size + b.size - i; return u ? i / u : 0; }
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function pct(a, b) { return b ? Math.round(100 * a / b) : 0; }
  function dateMs(iso) { if (!iso) return null; var t = Date.parse(iso + 'T12:00:00Z'); return isNaN(t) ? null : t; }
  function cut(s, n) { s = s || ''; return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + ' …' : s; }
  function splitSentences(text) { return (text || '').split(/(?<=[.!?])\s+|\n+|\s+[-–]\s+/).filter(function (x) { return x.trim().length > 3; }); }
  function quoteAround(sentence) {
    sentence = sentence.trim();
    return sentence.length > 220 ? cut(sentence, 220) : sentence;
  }

  /* ---------- Patterns ---------- */
  var S = '[^.!?\\n]';
  var POS = '(?:(?:positiv\\w*|gut\\w*|top|bessere?\\w*|good|great|positive)[\\s-]*(?:bewertung\\w*|rezension\\w*|reviews?)|(?:5|fünf|five)[\\s-]*(?:sterne?\\w*|stars?)|5\\s*\\*)';
  var INC2 = '(?:gutschein\\w*|geld\\s*zur[üu]ck|geld\\s*erstatt\\w*|r[üu]ckerstatt\\w*|erstattung\\w*|entsch[äa]dig\\w*|paypal|guthaben|geschenk\\w*|gift\\s?cards?|refund\\w*|reimburs\\w*|compensat\\w*|cashback|teilerstattung|gratis[\\s-]?(?:produkt|artikel|ware)\\w*|kostenlos\\w*\\s+(?:produkt|artikel)\\w*|free\\s+(?:product|item))';
  var INC = '(?:' + INC2 + '|\\d+\\s?(?:€|euro\\b|eur\\b)|\\$\\s?\\d+)';
  var LINK = '(?:f[üu]r|gegen|im\\s+austausch\\s+f[üu]r|for|in\\s+exchange\\s+for)';
  var COND = '(?:wenn|falls|sofern|if)';
  var RX = {
    bribe: [
      new RegExp(INC + S + '{0,60}\\b' + LINK + '\\b' + S + '{0,30}' + POS, 'i'),
      new RegExp(POS + S + '{0,40}\\b' + LINK + '\\b' + S + '{0,40}' + INC2, 'i'),
      new RegExp('\\b' + COND + '\\b' + S + '{0,60}' + POS + S + '{0,80}' + INC, 'i'),
      new RegExp(INC + S + '{0,80}\\b' + COND + '\\b' + S + '{0,60}' + POS, 'i')
    ],
    inc2: new RegExp(INC2, 'i'),
    offer: /\b(bot|biete\w*|angeboten|anbot|erhalte\w*|bekomm\w*|bekäme|zahl\w*|überweis\w*|zurück\w*|offer\w*|pay\w*|paid|sen[dt])\b/i,
    change: [
      new RegExp('(?:bewertung|rezension|review)\\w*' + S + '{0,50}\\b(?:zu\\s+)?(?:änder\\w*|abänder\\w*|lösch\\w*|entfern\\w*|zurückzu?zieh\\w*|zurückzu?nehm\\w*|hochzu?setz\\w*|korrigier\\w*|change|remove|delete|edit|update)\\b', 'i'),
      new RegExp('\\b(?:änder\\w*|lösch\\w*|entfern\\w*|zurückzieh\\w*|change|remove|delete)' + S + '{0,30}\\b(?:meine|die|seine|my|the)\\s+(?:bewertung|rezension|review)', 'i')
    ],
    seller: /(verkäufer|händler|hersteller|firma|kundenservice|kundendienst|support|seller|vendor|company|manufacturer)/i,
    ask: /\b(gebeten|bat|bittet|forder\w*|dräng\w*|wollte\w*|verlang\w*|angeboten|bot|biete\w*|anbot|asked|begged|pressur\w*|offered|wanted|requested)\b/i,
    cardCtx: /(?:karte|kärtchen|zettel|flyer|beilage|beileger|einleger|postkarte|visitenkarte)\b[^.!?\n]{0,50}\b(?:paket|verpackung|karton|box|beigelegt|beiliegend|lag|lagen|dabei|beigefügt)|\b(?:paket|verpackung|karton|box)\b[^.!?\n]{0,50}\b(?:karte|kärtchen|zettel|flyer|einleger)\b|\b(?:card|insert|note|flyer|leaflet)\b[^.!?\n]{0,40}\b(?:in|inside|included)\b[^.!?\n]{0,15}\b(?:box|package|packaging)\b/i,
    reviewWord: /(bewertung|rezension|sterne|review|stars?)/i,
    cardInc: /(gratis|kostenlos|geschenk|gutschein|erstatt|garantie\w*|bonus|gebeten|bitte|bittet|free|gift|refund|warranty|ask\w*)/i,
    fake: /(?:gekauft|gefälscht|fake|unecht|bezahlt|manipuliert|erkauft|geschönt|paid|bought|incentivi[sz]ed|bogus)\w*[\s-]*(?:bewertung|rezension|review|sterne|stars?)\w*|(?:bewertung|rezension|review|sterne)\w*\s+(?:hier\s+)?(?:sind|wirken|scheinen|waren|are|seem|look)\s+(?:wohl\s+|bestimmt\s+|sicher\s+|offensichtlich\s+|alle\s+|total\s+|totally\s+|obviously\s+|clearly\s+)?(?:gekauft|fake|gefälscht|unecht|erkauft|bezahlt|geschönt|paid|bought)/i,
    incentStrong: [
      /im\s+austausch\s+(für|gegen)\s+(eine\s+|meine\s+)?(ehrliche\s+|unabhängige\s+|neutrale\s+|objektive\s+)?(bewertung|rezension|meinung)/i,
      /\bals\s+produkttester(in)?\b|\btestexemplar\b|\brezensionsexemplar\b|\btestprodukt\b/i,
      /in\s+exchange\s+for\s+(my|an|a)\s+(honest|unbiased|fair)\s+(review|opinion|feedback)/i
    ],
    incentWeak: [
      /(kostenlos|kostenfrei|gratis|umsonst|vergünstigt|rabattiert)\w*\s+(zur\s+verfügung\s+gestellt|zugeschickt|zugesandt|bereitgestellt|überlassen)/i,
      /(zur\s+verfügung\s+gestellt|zugeschickt|zugesandt|bereitgestellt|überlassen)[^.!?\n]{0,25}(kostenlos|kostenfrei|gratis|vergünstigt|zum\s+test)/i,
      /(produkt|artikel|gerät|exemplar|muster|ware|set)\w*[^.!?\n]{0,30}(kostenlos|kostenfrei|gratis|umsonst|vergünstigt|rabattiert|zum\s+test(en)?)[^.!?\n]{0,30}(erhalten|bekommen|zugeschickt|zugesandt|zur\s+verfügung)/i,
      /zum\s+test(en)?\s+(erhalten|bekommen|zur\s+verfügung\s+gestellt|zugeschickt|zugesandt|bereitgestellt)/i,
      /(vom|von dem|durch den)\s+(hersteller|verkäufer|händler)\s+(kostenlos\s+|gratis\s+|vergünstigt\s+)?(zur\s+verfügung\s+gestellt|erhalten|bekommen|zugeschickt)/i,
      /(received|got|was\s+(sent|given|provided))\s+(this|the|a)?\s*(product|item|unit|sample)?\s*(for\s+free|free\s+of\s+charge|at\s+a\s+discount\w*)/i
    ],
    incentExclude: /(versand|lieferung|geliefert|porto|rücksend|rückversand|retour|ersatz|austauschgerät|umtausch|garantie|shipping|delivery|replacement|warranty)/i,
    vineInText: /\bvine\b/i
  };

  function anyRx(list, s) { for (var i = 0; i < list.length; i++) if (list[i].test(s)) return true; return false; }
  function isIncent(s) {
    if (anyRx(RX.incentStrong, s)) return true;
    return anyRx(RX.incentWeak, s) && !RX.incentExclude.test(s);
  }

  function classifySentence(s) {
    var out = [];
    if (anyRx(RX.bribe, s) && (RX.inc2.test(s) || RX.offer.test(s))) out.push('bribe');
    if (anyRx(RX.change, s) && (RX.inc2.test(s) || (RX.seller.test(s) && RX.ask.test(s)))) out.push('change');
    if (RX.cardCtx.test(s) && RX.reviewWord.test(s) && RX.cardInc.test(s)) out.push('card');
    if (RX.fake.test(s)) out.push('fake');
    return out;
  }

  var HOME = {
    'amazon.de': /deutschland|germany|allemagne|germania|alemania/i,
    'amazon.at': /österreich|austria|deutschland|germany/i,
    'amazon.com': /vereinigten staaten|united states|usa|estados unidos|états-unis/i,
    'amazon.co.uk': /vereinigten königreich|united kingdom|royaume-uni|regno unito|reino unido/i,
    'amazon.fr': /frankreich|france|francia/i,
    'amazon.it': /italien|italy|italia|italie/i,
    'amazon.es': /spanien|spain|españa|espagne|spagna/i,
    'amazon.nl': /niederlande|netherlands|nederland|pays-bas/i,
    'amazon.pl': /polen|poland|polska|pologne/i,
    'amazon.se': /schweden|sweden|sverige/i,
    'amazon.com.be': /belgien|belgium|belgique|belgië/i
  };

  /* ---------- Normalize ---------- */
  function normalize(raw) {
    var P = raw.phases || {};
    var pr = P.product || {};
    var prod = pr.product || {};
    var domain = (prod.domain || '').replace(/^(www|smile)\./, '');
    var homeRe = HOME[domain] || null;
    var byId = {}, all = [];
    function add(list, src) {
      (list || []).forEach(function (r) {
        if (!r || !r.id) return;
        if (byId[r.id]) { if (byId[r.id].src.indexOf(src) < 0) byId[r.id].src.push(src); return; }
        var c = {};
        for (var k in r) c[k] = r[k];
        c.src = [src];
        c.words = wc(r.body);
        c.domestic = !r.country || !homeRe || homeRe.test(r.country);
        c.ms = dateMs(r.date);
        c.flags = {};
        c.quotes = {};
        if (!c.vine && RX.vineInText.test((r.body || '') + ' ' + (r.title || '')) && /vine/i.test(r.body || '')) c.vineMention = true;
        byId[r.id] = c;
        all.push(c);
      });
    }
    add(pr.reviews, 'top');
    add(P.critical && P.critical.reviews, 'critical');
    add(P.recent && P.recent.reviews, 'recent');
    function from(src) { return all.filter(function (r) { return r.src.indexOf(src) >= 0; }); }
    return {
      raw: raw,
      product: prod,
      domain: domain,
      all: all,
      top: from('top'),
      critical: from('critical'),
      recent: from('recent'),
      unbiased: all.filter(function (r) { return r.src.indexOf('top') >= 0 || r.src.indexOf('recent') >= 0; })
    };
  }

  /* ---------- Flags per review ---------- */
  function flagReviews(D) {
    D.all.forEach(function (r) {
      var sents = splitSentences((r.title ? r.title + '. ' : '') + (r.body || ''));
      sents.forEach(function (s) {
        classifySentence(s).forEach(function (cat) {
          if (!r.flags[cat]) { r.flags[cat] = true; r.quotes[cat] = quoteAround(s); }
        });
        if (!r.vine && !r.vineMention && (r.stars || 0) >= 4 && isIncent(s) && !r.flags.incent) {
          r.flags.incent = true; r.quotes.incent = quoteAround(s);
        }
      });
    });
  }

  function findDuplicates(D) {
    var titleGrams = ngrams(toks(D.product.title || ''), 8);
    var items = D.all.map(function (r) {
      var t = toks(r.body);
      if (t.length < 15) return null;
      var g8 = ngrams(t, 8);
      titleGrams.forEach(function (g) { g8.delete(g); });
      return { r: r, g3: ngrams(t, 3), g8: g8 };
    }).filter(Boolean);
    var pairs = [];
    for (var i = 0; i < items.length; i++) {
      for (var j = i + 1; j < items.length; j++) {
        var a = items[i], b = items[j];
        if (a.r.profile && a.r.profile === b.r.profile) continue;
        var jac = jaccard(a.g3, b.g3);
        var s8 = inter(a.g8, b.g8);
        if (jac >= 0.45 || s8 >= 3) {
          pairs.push({ a: a.r, b: b.r, sim: Math.max(jac, Math.min(1, s8 / 10)) });
          a.r.flags.dup = true; b.r.flags.dup = true;
        }
      }
    }
    return pairs;
  }

  function ex(r, cat) {
    return {
      stars: r.stars, title: cut(r.title || '', 80), date: r.date, verified: r.verified, vine: r.vine,
      quote: r.quotes && cat ? r.quotes[cat] : cut(r.body || '', 200)
    };
  }

  /* ---------- Checks (return text keys; translated in the UI) ---------- */
  function M(k, p) { return { k: k, p: p || {} }; }
  function isoOf(ms) { return new Date(ms).toISOString().slice(0, 10); }

  function checkManipulation(D) {
    var hits = D.all.filter(function (r) { return r.flags.bribe || r.flags.change || r.flags.card; });
    var c = { id: 'bribe' };
    if (!D.all.length) return na(c, M('common.noReviews'));
    var n = hits.length;
    c.examples = hits.slice(0, 4).map(function (r) {
      return ex(r, r.flags.bribe ? 'bribe' : r.flags.change ? 'change' : 'card');
    });
    if (n === 0) return ok(c, M('bribe.ok'));
    var m = M('bribe.hit', { n: n });
    if (n >= 3) return bad(c, 28, m);
    if (n === 2) return bad(c, 20, m);
    return warn(c, 12, m);
  }

  function checkFakeClaims(D) {
    var hits = D.all.filter(function (r) { return r.flags.fake; });
    var c = { id: 'claims' };
    c.examples = hits.slice(0, 3).map(function (r) { return ex(r, 'fake'); });
    if (!D.all.length) return na(c, M('common.noReviews'));
    if (hits.length === 0) return ok(c, M('claims.ok'));
    var m = M('claims.hit', { n: hits.length });
    if (hits.length >= 3) return warn(c, 10, m);
    return info(c, 3, m);
  }

  function checkIncentivized(D) {
    var pos = D.all.filter(function (r) { return (r.stars || 0) >= 4 && !r.vine && !r.vineMention; });
    var hits = pos.filter(function (r) { return r.flags.incent; });
    var c = { id: 'incent' };
    c.examples = hits.slice(0, 3).map(function (r) { return ex(r, 'incent'); });
    if (!pos.length) return na(c, M('incent.na'));
    if (!hits.length) return ok(c, M('incent.ok'));
    var share = hits.length / pos.length;
    var m = M('incent.hit', { n: hits.length, total: pos.length, pct: pct(hits.length, pos.length) });
    if (share >= 0.25 && hits.length >= 2) return bad(c, 22, m);
    if (share >= 0.10 || hits.length >= 2) return warn(c, 12, m);
    return info(c, 4, m);
  }

  function checkUnverified(D) {
    var s = D.all.filter(function (r) { return !r.vine; });
    var un = s.filter(function (r) { return !r.verified; });
    var c = { id: 'verified' };
    c.examples = un.filter(function (r) { return (r.stars || 0) >= 4; }).slice(0, 2).map(function (r) { return ex(r); });
    if (s.length < 8) return na(c, M('verified.na', { count: s.length }));
    var share = un.length / s.length;
    var base = M('verified.base', { pct: pct(s.length - un.length, s.length), un: un.length, count: s.length });
    if (share >= 0.4 && un.length >= 5) return bad(c, 18, [base, M('verified.bad')]);
    if (share >= 0.2 && un.length >= 3) return warn(c, 9, [base, M('verified.warn')]);
    return ok(c, base);
  }

  function checkVine(D) {
    var s = D.unbiased;
    var vine = s.filter(function (r) { return r.vine; });
    var c = { id: 'vine' };
    if (s.length < 5) return na(c, M('common.tooFew'));
    if (!vine.length) return ok(c, M('vine.ok'));
    var share = vine.length / s.length;
    var non = s.filter(function (r) { return !r.vine && r.stars; });
    var va = mean(vine.filter(function (r) { return r.stars; }).map(function (r) { return r.stars; }));
    var nav = mean(non.map(function (r) { return r.stars; }));
    var msgs = [M('vine.base', { n: vine.length, total: s.length, pct: pct(vine.length, s.length) })];
    var gap = (vine.length >= 3 && non.length >= 3 && va != null && nav != null) ? va - nav : 0;
    if (gap >= 0.8) msgs.push(M('vine.gap', { va: va, na: nav }));
    if (share >= 0.4 || gap >= 1.2) return warn(c, 6, msgs);
    if (share >= 0.15 || gap >= 0.8) return info(c, 2, msgs);
    return ok(c, msgs);
  }

  function checkDuplicates(D, pairs) {
    var c = { id: 'dup' };
    var long = D.all.filter(function (r) { return wc(r.body) >= 15; }).length;
    if (long < 4) return na(c, M('dup.na'));
    if (!pairs.length) return ok(c, M('dup.ok', { count: long }));
    var involved = new Set();
    pairs.forEach(function (p) { involved.add(p.a.id); involved.add(p.b.id); });
    c.examples = [];
    pairs.slice(0, 2).forEach(function (p) { c.examples.push(ex(p.a)); c.examples.push(ex(p.b)); });
    var m = M('dup.hit', { count: involved.size });
    if (pairs.length >= 2 || involved.size >= 3) return bad(c, 25, m);
    return warn(c, 14, m);
  }

  function histAvg(h) {
    if (!h) return null;
    var s = 0, w = 0;
    for (var k = 1; k <= 5; k++) { s += k * (h[k] || 0); w += (h[k] || 0); }
    return w ? s / w : null;
  }

  function checkHistogram(D) {
    var p = D.product, h = p.histogram;
    var c = { id: 'hist' };
    if (!h) return na(c, M('hist.notFound'));
    if ((p.total || 0) < 30) return na(c, M('hist.tooFew', { total: p.total || 0 }));
    var h5 = h[5] || 0, h4 = h[4] || 0, h1 = h[1] || 0, mid = (h[2] || 0) + (h[3] || 0) + h4;
    var r45 = h5 ? h4 / h5 : 1;
    var fewFour = h5 >= 70 && r45 < 0.09;
    var polar = h1 >= 10 && h5 >= 60 && mid <= 15;
    var pp = { h5: h5, h4: h4, h1: h1 };
    var msgs = [];
    if (fewFour) msgs.push(M('hist.fewFour', pp));
    if (polar) { if (msgs.length) msgs.push(M('space')); msgs.push(M('hist.polar', pp)); }
    if (fewFour && polar) return bad(c, 15, msgs);
    if (fewFour || polar) return warn(c, polar ? 10 : 8, msgs);
    if (h5 >= 88 && (p.total || 0) >= 100) return info(c, 4, M('hist.high', pp));
    return ok(c, M('hist.ok', pp));
  }

  function checkTrend(D) {
    var c = { id: 'trend' };
    var rec = D.recent.filter(function (r) { return r.stars; });
    var ha = histAvg(D.product.histogram);
    if (rec.length < 15 || ha == null) return na(c, M('common.deepOnly'));
    var ra = mean(rec.map(function (r) { return r.stars; }));
    var diff = ra - ha;
    var base = M('trend.base', { count: rec.length, ra: ra, ha: ha });
    if (diff <= -1.3) return bad(c, 16, [base, M('trend.bad')]);
    if (diff <= -0.8) return warn(c, 10, [base, M('trend.warn')]);
    return ok(c, base);
  }

  function checkBurst(D) {
    var c = { id: 'burst' };
    var rec = D.recent.filter(function (r) { return r.ms; }).sort(function (a, b) { return a.ms - b.ms; });
    if (rec.length < 15) return na(c, M('common.deepOnly'));
    var span = Math.max(1, (rec[rec.length - 1].ms - rec[0].ms) / DAY);
    if (span < 6) return ok(c, M('burst.short', { count: rec.length }));
    var best = { n: 0, i: 0 };
    for (var i = 0; i < rec.length; i++) {
      var n = 0;
      for (var j = i; j < rec.length && rec[j].ms - rec[i].ms < 3 * DAY; j++) n++;
      if (n > best.n) best = { n: n, i: i };
    }
    var win = rec.slice(best.i, best.i + best.n);
    var five = win.filter(function (r) { return r.stars === 5; }).length;
    var expected = rec.length * Math.min(3, span) / span;
    var factor = best.n / Math.max(expected, 0.5);
    var base = M('burst.base', { k: best.n, count: rec.length, from: isoOf(win[0].ms), five: five });
    if (best.n >= 8 && factor >= 6 && five / best.n >= 0.7) return bad(c, 16, [base, M('burst.bad')]);
    if (best.n >= 5 && factor >= 4 && five / best.n >= 0.7) return warn(c, 10, [base, M('burst.warn')]);
    return ok(c, M('burst.ok'));
  }

  function checkHijack(D) {
    var c = { id: 'hijack' };
    var fa = dateMs(D.product.firstAvailable);
    if (!fa) return na(c, M('hijack.na'));
    var old = D.all.filter(function (r) { return r.domestic && r.ms && r.ms < fa - 30 * DAY; });
    c.examples = old.slice(0, 2).map(function (r) { return ex(r); });
    var since = isoOf(fa);
    if (!old.length) return ok(c, M('hijack.ok', { since: since }));
    if (D.product.hasVariations) return info(c, 3, M('hijack.variants', { n: old.length, since: since }));
    var m = M('hijack.hit', { n: old.length, since: since });
    if (old.length >= 2) return bad(c, 18, m);
    return warn(c, 8, m);
  }

  function checkVelocity(D) {
    var p = D.product;
    var c = { id: 'velocity' };
    var fa = dateMs(p.firstAvailable);
    if (!fa || !p.total) return na(c, M('velocity.na'));
    var months = Math.max(1, (D.now - fa) / (30.44 * DAY));
    var perMonth = p.total / months;
    var msgs = [M('velocity.base', { since: isoOf(fa), total: p.total, pm: Math.round(perMonth) })];
    if (p.bought) {
      msgs.push(M('velocity.bought', { b: p.bought }));
      if (perMonth > p.bought && months <= 18 && !p.hasVariations) return warn(c, 10, msgs.concat(M('velocity.warn')));
      if (perMonth > p.bought * 0.5) return info(c, 3, msgs.concat(M(p.hasVariations ? 'velocity.infoVariants' : 'velocity.info')));
      return ok(c, msgs.concat(M('velocity.ok')));
    }
    if (months < 3 && p.total >= 300) return info(c, 3, msgs.concat(M('velocity.fast')));
    return info(c, 0, msgs);
  }

  function checkGeneric(D) {
    var c = { id: 'generic' };
    var five = D.unbiased.filter(function (r) { return r.stars === 5; });
    if (five.length < 6) return na(c, M('generic.na'));
    var short = five.filter(function (r) { return r.words <= 6; });
    c.examples = short.slice(0, 3).map(function (r) { return ex(r); });
    if (short.length / five.length >= 0.5) return info(c, 3, [M('generic.base', { n: short.length, total: five.length }), M('generic.info')]);
    return ok(c, M('generic.ok'));
  }

  function mk(c, level, penalty, msgs) {
    c.level = level; c.penalty = penalty || 0;
    c.msgs = Array.isArray(msgs) ? msgs : [msgs];
    c.examples = c.examples || [];
    return c;
  }
  function ok(c, m) { return mk(c, 'ok', 0, m); }
  function info(c, p, m) { return mk(c, 'info', p, m); }
  function warn(c, p, m) { return mk(c, 'warn', p, m); }
  function bad(c, p, m) { return mk(c, 'bad', p, m); }
  function na(c, m) { c.examples = []; return mk(c, 'na', 0, m); }

  var GRADES = [{ g: 'A', min: 85 }, { g: 'B', min: 70 }, { g: 'C', min: 55 }, { g: 'D', min: 40 }, { g: 'F', min: 0 }];

  function analyze(raw, now) {
    var D = normalize(raw);
    D.now = now || Date.now();
    flagReviews(D);
    var pairs = findDuplicates(D);

    var checks = [
      checkManipulation(D),
      checkDuplicates(D, pairs),
      checkIncentivized(D),
      checkHistogram(D),
      checkHijack(D),
      checkTrend(D),
      checkBurst(D),
      checkVelocity(D),
      checkUnverified(D),
      checkVine(D),
      checkFakeClaims(D),
      checkGeneric(D)
    ];
    var penalty = checks.reduce(function (s, c) { return s + (c.penalty || 0); }, 0);
    var score = Math.max(0, Math.min(100, 100 - penalty));

    var p = D.product;
    var n = D.all.length;
    var enough = n >= 3 || (p.histogram && (p.total || 0) >= 30);
    var grade = '?';
    if (enough) {
      for (var i = 0; i < GRADES.length; i++) if (score >= GRADES[i].min) { grade = GRADES[i].g; break; }
    }

    var conf = n >= 40 ? 'high' : n >= 12 ? 'medium' : 'low';
    var confMsg = conf === 'low' ? M('conf.few', { n: n }) : M('conf.checked', { n: n });

    // Adjusted sample average
    var sample = D.recent.length >= 15 ? D.recent : D.unbiased;
    var rated = sample.filter(function (r) { return r.stars; });
    var cleanSet = rated.filter(function (r) { return r.verified && !r.vine && !r.flags.incent && !r.flags.dup; });
    var adjusted = null;
    if (cleanSet.length >= 6 && rated.length >= 8) {
      adjusted = {
        all: mean(rated.map(function (r) { return r.stars; })),
        clean: mean(cleanSet.map(function (r) { return r.stars; })),
        nAll: rated.length,
        nClean: cleanSet.length,
        basis: D.recent.length >= 15 ? 'newest' : 'visible'
      };
    }

    var critical = D.all.filter(function (r) { return r.stars && r.stars <= 2 && (r.body || r.title); })
      .sort(function (a, b) { return (b.helpful || 0) - (a.helpful || 0) || (b.ms || 0) - (a.ms || 0); })
      .slice(0, 3)
      .map(function (r) { return { stars: r.stars, title: cut(r.title || '', 90), quote: cut(r.body || '', 260), date: r.date, verified: r.verified, helpful: r.helpful || 0 }; });

    var flags = raw.flags || {};
    var store = D.domain ? D.domain.replace(/^amazon\./, 'Amazon.') : 'Amazon';
    var notes = [];
    if (flags.restricted) notes.push({ level: 'warn', k: 'note.restricted', p: { store: store } });
    if (flags.needsLogin) notes.push({ level: 'info', k: 'note.needsLogin', p: { store: store } });
    if (!p.histogram) notes.push({ level: 'info', k: 'note.noHist', p: {} });
    if (n === 0 && (p.total || 0) > 0) notes.push({ level: 'warn', k: 'note.noText', p: {} });
    if ((flags.errors || []).length) notes.push({ level: 'info', k: 'note.errors', p: { codes: flags.errors.slice(0, 5) } });

    return {
      version: 2,
      when: D.now,
      product: {
        title: p.title || '', brand: p.brand || '', asin: p.asin || '', url: p.url || '', domain: D.domain,
        avg: p.avg, total: p.total, histogram: p.histogram || null, seller: p.seller || '',
        firstAvailable: p.firstAvailable || null, bought: p.bought || null
      },
      mode: raw.mode || 'quick',
      score: score,
      grade: grade,
      confidence: conf,
      confMsg: confMsg,
      reviewCount: n,
      adjusted: adjusted,
      checks: checks,
      warnings: checks.filter(function (c) { return c.level === 'bad' || c.level === 'warn'; }).map(function (c) { return c.id; }),
      critical: critical,
      notes: notes
    };
  }

  analyze._internal = { normalize: normalize, classifySentence: classifySentence, splitSentences: splitSentences, isIncent: isIncent, RX: RX };
  if (typeof module !== 'undefined' && module.exports) module.exports = analyze;
  else root.RC_analyze = analyze;
})(this);
