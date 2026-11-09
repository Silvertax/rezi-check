/*
 * Rezi-Check – Analyse der ausgelesenen Amazon-Daten.
 * analyze(raw, nowMs) -> { grade, score, checks[], ... }
 * Reine Heuristik: liefert Indizien, keinen Beweis.
 */
(function (root) {
  'use strict';
  var DAY = 86400000;

  /* ---------- Hilfsfunktionen ---------- */
  function wc(s) { s = (s || '').trim(); return s ? s.split(/\s+/).length : 0; }
  function toks(s) { return (s || '').toLowerCase().replace(/[^a-z0-9äöüßéèêàâîôûçñ]+/g, ' ').trim().split(' ').filter(Boolean); }
  function ngrams(t, n) { var s = new Set(); for (var i = 0; i + n <= t.length; i++) s.add(t.slice(i, i + n).join(' ')); return s; }
  function inter(a, b) { var c = 0; a.forEach(function (x) { if (b.has(x)) c++; }); return c; }
  function jaccard(a, b) { var i = inter(a, b); var u = a.size + b.size - i; return u ? i / u : 0; }
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function pct(a, b) { return b ? Math.round(100 * a / b) : 0; }
  function f1(x) { return x == null ? '–' : x.toFixed(1).replace('.', ','); }
  function num(x) { return x == null ? '–' : String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function dateMs(iso) { if (!iso) return null; var t = Date.parse(iso + 'T12:00:00Z'); return isNaN(t) ? null : t; }
  function dShort(ms) { var d = new Date(ms); return d.getUTCDate() + '.' + (d.getUTCMonth() + 1) + '.' + d.getUTCFullYear(); }
  function cut(s, n) { s = s || ''; return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + ' …' : s; }
  function splitSentences(text) { return (text || '').split(/(?<=[.!?])\s+|\n+|\s+[-–]\s+/).filter(function (x) { return x.trim().length > 3; }); }
  function quoteAround(sentence) {
    sentence = sentence.trim();
    return sentence.length > 220 ? cut(sentence, 220) : sentence;
  }

  /* ---------- Muster ---------- */
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

  /* ---------- Normalisieren ---------- */
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

  /* ---------- Markierungen pro Rezension ---------- */
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

  /* ---------- Prüfungen ---------- */
  function checkManipulation(D) {
    var hits = D.all.filter(function (r) { return r.flags.bribe || r.flags.change || r.flags.card; });
    var c = { id: 'bribe', title: 'Gekaufte Bewertungen gemeldet?', icon: 'coin' };
    if (!D.all.length) return na(c, 'Keine Rezensionen zum Durchsuchen.');
    var n = hits.length;
    c.examples = hits.slice(0, 4).map(function (r) {
      var cat = r.flags.bribe ? 'bribe' : r.flags.change ? 'change' : 'card';
      return ex(r, cat);
    });
    if (n === 0) return ok(c, 'Kein Käufer berichtet von Geld, Gutscheinen oder Beipackzetteln für gute Bewertungen.');
    var t = n + (n === 1 ? ' Rezension berichtet' : ' Rezensionen berichten') +
      ' von Geld, Gutscheinen, Beipack-Karten oder der Bitte, eine Bewertung zu ändern. Das ist bei Amazon verboten – und ein starker Hinweis, dass auch andere Bewertungen „erkauft“ sind.';
    if (n >= 3) return bad(c, 28, t);
    if (n === 2) return bad(c, 20, t);
    return warn(c, 12, t);
  }

  function checkFakeClaims(D) {
    var hits = D.all.filter(function (r) { return r.flags.fake; });
    var c = { id: 'claims', title: 'Käufer zweifeln an den Bewertungen', icon: 'eye' };
    c.examples = hits.slice(0, 3).map(function (r) { return ex(r, 'fake'); });
    if (!D.all.length) return na(c, 'Keine Rezensionen zum Durchsuchen.');
    if (hits.length === 0) return ok(c, 'Niemand bezeichnet die Bewertungen als gekauft oder gefälscht.');
    var t = hits.length + (hits.length === 1 ? ' Käufer hält' : ' Käufer halten') + ' die Bewertungen für gekauft oder gefälscht. Subjektiv – aber ein Grund, genauer hinzusehen.';
    if (hits.length >= 3) return warn(c, 10, t);
    return info(c, 3, t);
  }

  function checkIncentivized(D) {
    var pos = D.all.filter(function (r) { return (r.stars || 0) >= 4 && !r.vine && !r.vineMention; });
    var hits = pos.filter(function (r) { return r.flags.incent; });
    var c = { id: 'incent', title: 'Produkt gratis bekommen', icon: 'gift' };
    c.examples = hits.slice(0, 3).map(function (r) { return ex(r, 'incent'); });
    if (!pos.length) return na(c, 'Keine positiven Rezensionen in der Stichprobe.');
    var share = hits.length / pos.length;
    if (!hits.length) return ok(c, 'Keine positive Rezension (außerhalb von Amazon Vine) erwähnt ein Gratis- oder Testprodukt.');
    var t = (hits.length === 1 ? 'Eine' : hits.length) + ' von ' + pos.length + ' positiven Rezensionen (' + pct(hits.length, pos.length) + ' %) ' +
      (hits.length === 1 ? 'stammt von jemandem, der das Produkt gratis oder vergünstigt bekommen hat' : 'stammen von Leuten, die das Produkt gratis oder vergünstigt bekommen haben') +
      ' – außerhalb von Amazons Vine-Programm ist das nicht erlaubt.';
    if (share >= 0.25 && hits.length >= 2) return bad(c, 22, t);
    if (share >= 0.10 || hits.length >= 2) return warn(c, 12, t);
    return info(c, 4, t);
  }

  function checkUnverified(D) {
    var s = D.all.filter(function (r) { return !r.vine; });
    var un = s.filter(function (r) { return !r.verified; });
    var c = { id: 'verified', title: 'Verifizierte Käufe', icon: 'check' };
    c.examples = un.filter(function (r) { return (r.stars || 0) >= 4; }).slice(0, 2).map(function (r) { return ex(r); });
    if (s.length < 8) return na(c, 'Zu wenige Rezensionen für eine Aussage (' + s.length + ').');
    var share = un.length / s.length;
    var t = pct(s.length - un.length, s.length) + ' % der Rezensionen sind „Verifizierte Käufe“ (' + un.length + ' von ' + s.length + ' ohne Kaufnachweis).';
    if (share >= 0.4 && un.length >= 5) return bad(c, 18, t + ' Ungewöhnlich viele – nicht verifizierte Rezensionen lassen sich leicht fälschen.');
    if (share >= 0.2 && un.length >= 3) return warn(c, 9, t + ' Etwas mehr als üblich.');
    return ok(c, t);
  }

  function checkVine(D) {
    var s = D.unbiased;
    var vine = s.filter(function (r) { return r.vine; });
    var c = { id: 'vine', title: 'Amazon-Vine-Tester', icon: 'leaf' };
    if (s.length < 5) return na(c, 'Zu wenige Rezensionen.');
    var share = vine.length / s.length;
    if (!vine.length) return ok(c, 'Keine Vine-Rezensionen in der Stichprobe.');
    var non = s.filter(function (r) { return !r.vine && r.stars; });
    var va = mean(vine.filter(function (r) { return r.stars; }).map(function (r) { return r.stars; }));
    var na_ = mean(non.map(function (r) { return r.stars; }));
    var t = (vine.length === 1 ? 'Eine' : vine.length) + ' von ' + s.length + ' Rezensionen (' + pct(vine.length, s.length) + ' %) ' + (vine.length === 1 ? 'stammt' : 'stammen') + ' aus Amazon Vine: Tester bekommen das Produkt gratis. Das ist erlaubt, fällt aber oft wohlwollender aus.';
    var gap = (vine.length >= 3 && non.length >= 3 && va != null && na_ != null) ? va - na_ : 0;
    if (gap >= 0.8) t += ' Vine-Tester vergeben hier im Schnitt ' + f1(va) + ' ★, alle anderen nur ' + f1(na_) + ' ★.';
    if (share >= 0.4 || gap >= 1.2) return warn(c, 6, t);
    if (share >= 0.15 || gap >= 0.8) return info(c, 2, t);
    return ok(c, t);
  }

  function checkDuplicates(D, pairs) {
    var c = { id: 'dup', title: 'Ähnliche oder kopierte Texte', icon: 'copy' };
    var long = D.all.filter(function (r) { return wc(r.body) >= 15; }).length;
    if (long < 4) return na(c, 'Zu wenige längere Rezensionen zum Vergleichen.');
    if (!pairs.length) return ok(c, 'Keine auffällig ähnlichen Texte unter ' + long + ' längeren Rezensionen.');
    var involved = new Set();
    pairs.forEach(function (p) { involved.add(p.a.id); involved.add(p.b.id); });
    c.examples = [];
    pairs.slice(0, 2).forEach(function (p) { c.examples.push(ex(p.a)); c.examples.push(ex(p.b)); });
    var t = involved.size + ' Rezensionen verschiedener Personen ähneln sich stark im Wortlaut – typisch für Bewertungen nach Vorlage.';
    if (pairs.length >= 2 || involved.size >= 3) return bad(c, 25, t);
    return warn(c, 14, t);
  }

  function histAvg(h) {
    if (!h) return null;
    var s = 0, w = 0;
    for (var k = 1; k <= 5; k++) { s += k * (h[k] || 0); w += (h[k] || 0); }
    return w ? s / w : null;
  }

  function checkHistogram(D) {
    var p = D.product, h = p.histogram;
    var c = { id: 'hist', title: 'Sterneverteilung', icon: 'bars' };
    if (!h) return na(c, 'Sterneverteilung nicht gefunden.');
    if ((p.total || 0) < 30) return na(c, 'Zu wenige Bewertungen (' + num(p.total) + ') für eine Aussage.');
    var h5 = h[5] || 0, h4 = h[4] || 0, h1 = h[1] || 0, mid = (h[2] || 0) + (h[3] || 0) + h4;
    var r45 = h5 ? h4 / h5 : 1;
    var fewFour = h5 >= 70 && r45 < 0.09;
    var polar = h1 >= 10 && h5 >= 60 && mid <= 15;
    var parts = [];
    if (fewFour) parts.push('Fast nur 5 Sterne und kaum 4 Sterne (' + h5 + ' % zu ' + h4 + ' %). Zufriedene echte Käufer vergeben meist auch öfter 4 Sterne.');
    if (polar) parts.push('„Top oder Flop“: ' + h5 + ' % 5 Sterne, aber ' + h1 + ' % 1 Stern und kaum Mittelfeld – typisch, wenn gute Bewertungen eingekauft werden und echte Käufer enttäuscht sind.');
    if (fewFour && polar) return bad(c, 15, parts.join(' '));
    if (fewFour || polar) return warn(c, polar ? 10 : 8, parts.join(' '));
    if (h5 >= 88 && (p.total || 0) >= 100) return info(c, 4, 'Sehr hoher 5-Sterne-Anteil (' + h5 + ' %). Kann echt sein, ist aber ungewöhnlich.');
    return ok(c, 'Die Verteilung (' + h5 + ' % 5★, ' + h4 + ' % 4★, ' + h1 + ' % 1★) wirkt natürlich.');
  }

  function checkTrend(D) {
    var c = { id: 'trend', title: 'Neue vs. alte Bewertungen', icon: 'trend' };
    var rec = D.recent.filter(function (r) { return r.stars; });
    var ha = histAvg(D.product.histogram);
    if (rec.length < 15 || ha == null) return na(c, 'Nur im Modus „Gründlich“ mit Anmeldung prüfbar.');
    var ra = mean(rec.map(function (r) { return r.stars; }));
    var diff = ra - ha;
    var t = 'Die neuesten ' + rec.length + ' Rezensionen liegen im Schnitt bei ' + f1(ra) + ' ★, alle Bewertungen zusammen bei ' + f1(ha) + ' ★.';
    if (diff <= -1.3) return bad(c, 16, t + ' Deutlich schlechter: Ältere (womöglich gekaufte) Bewertungen halten den Schnitt hoch – oder die Qualität hat nachgelassen.');
    if (diff <= -0.8) return warn(c, 10, t + ' Spürbar schlechter als der Gesamtschnitt.');
    return ok(c, t);
  }

  function checkBurst(D) {
    var c = { id: 'burst', title: 'Zeitliche Häufung', icon: 'clock' };
    var rec = D.recent.filter(function (r) { return r.ms; }).sort(function (a, b) { return a.ms - b.ms; });
    if (rec.length < 15) return na(c, 'Nur im Modus „Gründlich“ mit Anmeldung prüfbar.');
    var span = Math.max(1, (rec[rec.length - 1].ms - rec[0].ms) / DAY);
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
    var t = best.n + ' der letzten ' + rec.length + ' Rezensionen kamen innerhalb von 3 Tagen (ab ' + dShort(win[0].ms) + '), davon ' + five + '× 5 Sterne.';
    if (span < 6) return ok(c, 'Die letzten ' + rec.length + ' Rezensionen verteilen sich auf wenige Tage – bei so vielen Bewertungen ist keine Häufung erkennbar.');
    if (best.n >= 8 && factor >= 6 && five / best.n >= 0.7) return bad(c, 16, t + ' Solche Wellen entstehen oft durch Bewertungs-Kampagnen (aber auch Aktionstage wie Prime Day können Spitzen erzeugen).');
    if (best.n >= 5 && factor >= 4 && five / best.n >= 0.7) return warn(c, 10, t + ' Auffällige Häufung positiver Rezensionen.');
    return ok(c, 'Die neuesten Rezensionen verteilen sich gleichmäßig über die Zeit.');
  }

  function checkHijack(D) {
    var c = { id: 'hijack', title: 'Rezensionen älter als das Produkt', icon: 'link' };
    var fa = dateMs(D.product.firstAvailable);
    if (!fa) return na(c, 'Listungsdatum nicht gefunden.');
    var old = D.all.filter(function (r) { return r.domestic && r.ms && r.ms < fa - 30 * DAY; });
    c.examples = old.slice(0, 2).map(function (r) { return ex(r); });
    if (!old.length) return ok(c, 'Alle Rezensionen sind jünger als die Listung (seit ' + dShort(fa) + ').');
    var t = old.length + (old.length === 1 ? ' Rezension ist' : ' Rezensionen sind') + ' älter als das Produkt selbst (bei Amazon seit ' + dShort(fa) +
      '). Vermutlich wurden Bewertungen von einem anderen Produkt übernommen („Review-Hijacking“ oder Zusammenlegen von Varianten).';
    if (D.product.hasVariations) {
      return info(c, 3, old.length + (old.length === 1 ? ' Rezension ist' : ' Rezensionen sind') + ' älter als diese Variante (bei Amazon seit ' + dShort(fa) +
        '). Bei Produkten mit Varianten teilen sich alle Varianten die Rezensionen – das kann also harmlos sein. Prüfe, ob die alten Rezensionen wirklich zu diesem Produkt passen.');
    }
    if (old.length >= 2) return bad(c, 18, t);
    return warn(c, 8, t);
  }

  function checkVelocity(D) {
    var p = D.product;
    var c = { id: 'velocity', title: 'Bewertungen im Verhältnis zu Verkäufen', icon: 'speed' };
    var fa = dateMs(p.firstAvailable);
    if (!fa || !p.total) return na(c, 'Listungsdatum oder Anzahl der Bewertungen fehlt.');
    var months = Math.max(1, (D.now - fa) / (30.44 * DAY));
    var perMonth = p.total / months;
    var base = 'Seit ' + dShort(fa) + ' im Angebot: ' + num(p.total) + ' Bewertungen, also etwa ' + num(Math.round(perMonth)) + ' pro Monat.';
    if (p.bought) {
      base += ' Laut Amazon wurde es zuletzt über ' + num(p.bought) + '-mal im Monat gekauft.';
      if (perMonth > p.bought && months <= 18 && !p.hasVariations) return warn(c, 10, base + ' Das sind mehr Bewertungen pro Monat als Verkäufe – normalerweise bewertet nur ein kleiner Teil der Käufer.');
      if (perMonth > p.bought * 0.5) return info(c, 3, base + ' Ungewöhnlich viele Bewertungen im Verhältnis zu den Verkäufen' + (p.hasVariations ? ' (allerdings zählen Bewertungen aller Varianten zusammen).' : '.'));
      return ok(c, base + ' Das passt zusammen.');
    }
    if (months < 3 && p.total >= 300) return info(c, 3, base + ' Sehr viele Bewertungen in sehr kurzer Zeit.');
    return info(c, 0, base);
  }

  function checkGeneric(D) {
    var c = { id: 'generic', title: 'Lob ohne Inhalt', icon: 'quote' };
    var five = D.unbiased.filter(function (r) { return r.stars === 5; });
    if (five.length < 6) return na(c, 'Zu wenige 5-Sterne-Rezensionen.');
    var short = five.filter(function (r) { return r.words <= 6; });
    c.examples = short.slice(0, 3).map(function (r) { return ex(r); });
    var t = short.length + ' von ' + five.length + ' 5-Sterne-Rezensionen bestehen aus höchstens sechs Wörtern.';
    if (short.length / five.length >= 0.5) return info(c, 3, t + ' Viel Lob ohne Details ist ein schwaches Warnsignal.');
    return ok(c, 'Die 5-Sterne-Rezensionen enthalten überwiegend konkrete Angaben.');
  }

  function mk(c, level, penalty, text) { c.level = level; c.penalty = penalty || 0; c.text = text; c.examples = c.examples || []; return c; }
  function ok(c, t) { return mk(c, 'ok', 0, t); }
  function info(c, p, t) { return mk(c, 'info', p, t); }
  function warn(c, p, t) { return mk(c, 'warn', p, t); }
  function bad(c, p, t) { return mk(c, 'bad', p, t); }
  function na(c, t) { c.examples = []; return mk(c, 'na', 0, t); }

  var GRADES = [
    { g: 'A', min: 85, label: 'Unauffällig', text: 'Keine typischen Fake-Muster gefunden.' },
    { g: 'B', min: 70, label: 'Größtenteils unauffällig', text: 'Einzelne Hinweise, aber nichts Gravierendes.' },
    { g: 'C', min: 55, label: 'Gemischt', text: 'Einige Warnsignale – lies vor allem die kritischen Rezensionen.' },
    { g: 'D', min: 40, label: 'Deutliche Warnsignale', text: 'Die Bewertungen sind wahrscheinlich teilweise geschönt.' },
    { g: 'F', min: 0, label: 'Sehr verdächtig', text: 'Starke Hinweise auf manipulierte Bewertungen.' }
  ];

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
    var grade = null;
    if (enough) {
      for (var i = 0; i < GRADES.length; i++) if (score >= GRADES[i].min) { grade = GRADES[i]; break; }
    }

    var conf, confText;
    if (n >= 40) { conf = 'hoch'; confText = n + ' Rezensionen geprüft.'; }
    else if (n >= 12) { conf = 'mittel'; confText = n + ' Rezensionen geprüft.'; }
    else { conf = 'gering'; confText = 'Nur ' + n + ' Rezension' + (n === 1 ? '' : 'en') + ' sichtbar – Amazon zeigt ohne Anmeldung nur wenige.'; }

    // Bereinigter Stichproben-Schnitt
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
        basis: D.recent.length >= 15 ? 'neuesten Rezensionen' : 'sichtbaren Rezensionen'
      };
    }

    var critical = D.all.filter(function (r) { return r.stars && r.stars <= 2 && (r.body || r.title); })
      .sort(function (a, b) { return (b.helpful || 0) - (a.helpful || 0) || (b.ms || 0) - (a.ms || 0); })
      .slice(0, 3)
      .map(function (r) { return { stars: r.stars, title: cut(r.title || '', 90), quote: cut(r.body || '', 260), date: r.date, verified: r.verified, helpful: r.helpful || 0 }; });

    var flags = raw.flags || {};
    var notes = [];
    if (flags.restricted) notes.push({ level: 'warn', text: 'Amazon zeigt deinem Konto gerade nur wenige Rezensionen (Schutz vor automatischem Auslesen). Auf amazon.de kannst du die Freigabe anfordern – nutze „Gründlich“ eine Weile nicht.' });
    if (flags.needsLogin) notes.push({ level: 'info', text: 'Für „Gründlich“ (mehr Rezensionen, Trend und zeitliche Häufung) musst du dich in der App bei Amazon anmelden.' });
    if (!p.histogram) notes.push({ level: 'info', text: 'Die Sterneverteilung konnte nicht gelesen werden.' });
    if (n === 0 && (p.total || 0) > 0) notes.push({ level: 'warn', text: 'Es konnten keine Rezensionstexte gelesen werden. Möglicherweise hat Amazon die Seite umgebaut – nutze „Diagnose kopieren“ und schick sie mir.' });
    if ((flags.errors || []).length) notes.push({ level: 'info', text: 'Hinweis: ' + flags.errors.join(' · ') });

    var bads = checks.filter(function (c) { return c.level === 'bad' || c.level === 'warn'; });
    return {
      version: 1,
      when: D.now,
      product: {
        title: p.title || '', brand: p.brand || '', asin: p.asin || '', url: p.url || '', domain: D.domain,
        avg: p.avg, total: p.total, histogram: p.histogram || null, seller: p.seller || '',
        firstAvailable: p.firstAvailable || null, bought: p.bought || null
      },
      mode: raw.mode || 'quick',
      score: score,
      grade: grade ? grade.g : '?',
      label: grade ? grade.label : 'Zu wenig Daten',
      verdict: grade ? grade.text : 'Für eine Einschätzung fehlen Bewertungen oder Rezensionen.',
      confidence: conf,
      confidenceText: confText,
      reviewCount: n,
      adjusted: adjusted,
      checks: checks,
      warnings: bads.map(function (c) { return c.title; }),
      critical: critical,
      notes: notes
    };
  }

  analyze._internal = { normalize: normalize, classifySentence: classifySentence, splitSentences: splitSentences, isIncent: isIncent, RX: RX };
  if (typeof module !== 'undefined' && module.exports) module.exports = analyze;
  else root.RC_analyze = analyze;
})(this);
