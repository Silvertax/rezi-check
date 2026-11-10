/*
 * Rezi-Check – extraction script.
 * Runs in the hidden Amazon WebView. Reads product data, star distribution
 * and reviews from the DOM and stores the result in window.__RC_RESULT.
 * The app polls this result (no JS interface needed).
 *
 * window.__RC_OPTS = { phase: 'product' | 'critical' | 'recent', target, maxRounds, label, lang }
 */
(function () {
  'use strict';
  var OPTS = window.__RC_OPTS || { phase: 'product' };
  if (window.__RC_STATE === 'running') return 'already-running';
  window.__RC_STATE = 'running';
  window.__RC_RESULT = null;
  window.__RC_PROGRESS = '';

  var REVIEW_SEL = '[data-hook="review"], div[id^="customer_review-"]';
  var L = OPTS.lang === 'en'
    ? { reading: 'Reading product page …', waiting: 'Waiting for reviews …', loading: 'Loading reviews' }
    : { reading: 'Lese Produktseite …', waiting: 'Warte auf Rezensionen …', loading: 'Lade Rezensionen' };

  var T0 = Date.now();
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  /* Waits until cond() is true. Gives up after maxMs, or `grace` ms after the page has finished loading. */
  async function waitFor(cond, maxMs, grace) {
    var start = Date.now(), doneAt = 0;
    while (Date.now() - start < maxMs) {
      if (cond()) return true;
      if (document.readyState === 'complete') {
        if (!doneAt) doneAt = Date.now();
        else if (Date.now() - doneAt > grace) break;
      }
      await sleep(200);
    }
    return !!cond();
  }
  function rand(a, b) { return Math.round(a + Math.random() * (b - a)); }
  function progress(t) { window.__RC_PROGRESS = t; }
  function clean(s) {
    return String(s || '')
      .replace(/[​-‏‪-‮⁠﻿]/g, '')
      .replace(/[  ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function q(root, sel) { try { return root.querySelector(sel); } catch (e) { return null; } }
  function qa(root, sel) { try { return Array.prototype.slice.call(root.querySelectorAll(sel)); } catch (e) { return []; } }
  function textOf(el) { return el ? clean(el.textContent) : ''; }

  /* Text of a node with spaces at block/line boundaries */
  function blockText(el, removeSel) {
    if (!el) return '';
    var c = el.cloneNode(true);
    if (removeSel) qa(c, removeSel).forEach(function (n) { n.remove(); });
    qa(c, 'br').forEach(function (br) { br.replaceWith(' '); });
    qa(c, 'p, div, li, h1, h2, h3, h4, h5, span.a-list-item').forEach(function (n) { n.appendChild(c.ownerDocument.createTextNode(' ')); });
    return clean(c.textContent);
  }

  function parseCount(s) {
    if (!s) return null;
    var m = clean(s).match(/\d[\d.,\s]*/);
    if (!m) return null;
    var n = parseInt(m[0].replace(/[.,\s]/g, ''), 10);
    return isNaN(n) ? null : n;
  }

  /* ---------- Date & country ---------- */
  var MONTHS = {
    januar: 1, 'jänner': 1, january: 1, janvier: 1, gennaio: 1, enero: 1, januari: 1, styczeń: 1, stycznia: 1,
    februar: 2, feber: 2, february: 2, 'février': 2, fevrier: 2, febbraio: 2, febrero: 2, februari: 2, lutego: 2,
    'märz': 3, maerz: 3, march: 3, mars: 3, marzo: 3, maart: 3, marca: 3,
    april: 4, avril: 4, aprile: 4, abril: 4, kwietnia: 4,
    mai: 5, may: 5, maggio: 5, mayo: 5, mei: 5, maja: 5,
    juni: 6, june: 6, juin: 6, giugno: 6, junio: 6, czerwca: 6,
    juli: 7, july: 7, juillet: 7, luglio: 7, julio: 7, lipca: 7,
    august: 8, 'août': 8, aout: 8, agosto: 8, augustus: 8, sierpnia: 8,
    september: 9, septembre: 9, settembre: 9, septiembre: 9, setiembre: 9, 'września': 9,
    oktober: 10, october: 10, octobre: 10, ottobre: 10, octubre: 10, 'października': 10,
    november: 11, novembre: 11, noviembre: 11, listopada: 11,
    dezember: 12, december: 12, 'décembre': 12, decembre: 12, dicembre: 12, diciembre: 12, grudnia: 12
  };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parseDate(s) {
    if (!s) return null;
    var t = clean(s).toLowerCase();
    var m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[0];
    m = t.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
    if (m) return m[3] + '-' + pad(+m[2]) + '-' + pad(+m[1]);
    var tok = t.match(/\d+|[a-zäöüéèêûôîçàąćęłńóśźż]+/g) || [];
    var y = null, mo = null, d = null, moIdx = -1;
    tok.forEach(function (k, i) {
      if (/^\d{4}$/.test(k) && +k > 1990 && +k < 2100) y = +k;
      else if (MONTHS[k] && mo === null) { mo = MONTHS[k]; moIdx = i; }
    });
    if (!y || !mo) return null;
    // Day: the 1–2 digit number closest to the month name
    var best = 99;
    tok.forEach(function (k, i) {
      if (/^\d{1,2}$/.test(k) && +k >= 1 && +k <= 31) {
        var dist = Math.abs(i - moIdx);
        if (dist < best) { best = dist; d = +k; }
      }
    });
    if (!d) return null;
    return y + '-' + pad(mo) + '-' + pad(d);
  }
  function parseCountry(s) {
    var t = clean(s);
    var m = t.match(/Rezension aus (?:dem |der |den )?(.+?) vom /i) ||
      t.match(/Reviewed in (?:the )?(.+?) on /i) ||
      t.match(/Comment[ée] (?:en |au |aux )?(.+?) le /i) ||
      t.match(/Recensito in (.+?) il /i) ||
      t.match(/(?:Revisado|Calificado) en (.+?) el /i) ||
      t.match(/Beoordeeld in (?:het |de )?(.+?) op /i);
    return m ? m[1].trim() : '';
  }

  /* ---------- Single review ---------- */
  function parseStars(el) {
    if (!el) return null;
    var cls = (el.getAttribute && el.getAttribute('class')) || '';
    var m = cls.match(/a-star-(?:mini-|small-|medium-)?(\d)/);
    if (m) return +m[1];
    var inner = q(el, 'i[class*="a-star"]');
    if (inner) { m = (inner.getAttribute('class') || '').match(/a-star-(?:mini-|small-|medium-)?(\d)/); if (m) return +m[1]; }
    var alt = q(el, '.a-icon-alt');
    var t = clean(alt ? alt.textContent : el.textContent);
    m = t.match(/(\d)(?:[.,]\d)?\s*(?:von|out of|sur|su|de|van|z)\s*5/i) || t.match(/^(\d)(?:[.,]\d)?\b/);
    return m ? +m[1] : null;
  }

  var VINE_RE = /Vine[\s-]*(Kundenrezension|Customer Review|Voice|Produkttester|Mitglied|Programm)|kostenfreien Produkts|kostenlosen Produkts|of Free Product|produit gratuit|prodotto gratuito|producto gratuito|gratis product/i;
  var VERIFIED_RE = /Verifizierter Kauf|Verified Purchase|Achat v[ée]rifi[ée]|Acquisto verificato|Compra verificada|Geverifieerde aankoop|Zweryfikowany zakup/i;

  function hashStr(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return 'X' + (h >>> 0).toString(36);
  }

  function parseReview(el) {
    var starEl = q(el, '[data-hook^="review-star-rating"], [data-hook="cmps-review-star-rating"], i.review-rating, i[class*="a-star-"]');
    var stars = parseStars(starEl);

    var titleEl = q(el, '[data-hook="review-title"], [data-hook="reviewTitle"], .review-title-content, .review-title');
    var title = '';
    if (titleEl) {
      var orig = q(titleEl, '.cr-original-review-content');
      title = blockText(orig || titleEl, '.a-icon-alt, i, .a-letter-space, script, style');
      title = title.replace(/^\d(?:[.,]\d)?\s*(?:von|out of)\s*5\s*(?:Sternen|stars)\s*/i, '');
    }
    if (!stars && titleEl) stars = parseStars(titleEl);

    var bodyEl = q(el, '[data-hook="reviewRichContentContainer"]') || q(el, '[data-hook="review-collapsed"]') ||
      q(el, '[data-hook="review-body"]') || q(el, '[data-hook="reviewText"]') || q(el, '.review-text-content') || q(el, '.review-text');
    var body = '';
    if (bodyEl) {
      var ob = q(bodyEl, '.cr-original-review-content');
      body = blockText(ob || bodyEl, 'script, style, noscript, button, .a-expander-header, .cr-translate-this-review-section, ' +
        '[data-hook*="read-more"], [data-hook="expand-collapse-read-more-less"], .video-block, .cr-video-desktop, .a-declarative[data-action="reviews:show-more"]');
      body = body.replace(/\s*(Mehr lesen|Weniger lesen|Weiterlesen|Mehr anzeigen|Weniger anzeigen|Read more|Read less|Lire la suite|Leggi di più|Leer más)\s*$/i, '');
    }

    var dateText = textOf(q(el, '[data-hook="review-date"], .review-date'));
    var nameEl = q(el, '.a-profile-name, [data-hook="review-author"], .a-profile-content');
    var name = textOf(nameEl);
    var profA = q(el, 'a.a-profile, [data-hook="genome-widget"] a, a[href*="amzn1.account"]');
    var pm = profA ? (profA.getAttribute('href') || '').match(/amzn1\.account\.([A-Z0-9]+)/i) : null;

    // Meta text = everything except title & body (for badges)
    var meta = blockText(el, '[data-hook="review-body"], [data-hook="reviewText"], [data-hook="reviewRichContentContainer"], ' +
      '[data-hook="review-collapsed"], .review-text-content, [data-hook="review-title"], [data-hook="reviewTitle"], script, style');

    var verified = !!q(el, '[data-hook="avp-badge"], [data-hook="avp-badge-linkless"]') || VERIFIED_RE.test(meta);
    var vine = VINE_RE.test(meta) || !!q(el, '[data-hook*="vine"]');

    var helpfulText = textOf(q(el, '[data-hook="helpful-vote-statement"]'));
    var helpful = 0;
    if (helpfulText) {
      var hm = helpfulText.match(/\d[\d.,]*/);
      helpful = hm ? parseCount(hm[0]) : (/\b(eine|einer|one|une|una|uno|één|jedna)\b/i.test(helpfulText) ? 1 : 0);
    }

    var variant = textOf(q(el, '[data-hook="format-strip"], [data-hook="format-strip-linkless"], .review-format-strip'))
      .replace(VERIFIED_RE, '').replace(/\|\s*$/, '').trim();
    var images = qa(el, '[data-hook="review-image-tile"], img.review-image-tile, .review-image-tile-section img, [data-hook="cr-media-thumbnail"]').length;
    var video = qa(el, '[data-hook="review-video"], .cr-video-desktop, video').length;

    var id = '';
    var idm = (el.id || '').match(/R[0-9A-Z]{8,}/);
    if (idm) id = idm[0];
    if (!id && titleEl) {
      var tm = (titleEl.getAttribute('href') || '').match(/customer-reviews\/(R[0-9A-Z]+)/);
      if (tm) id = tm[1];
    }
    if (!id) id = hashStr(name + '|' + title + '|' + dateText + '|' + body.slice(0, 60));

    if (!stars && !body && !title) return null;
    return {
      id: id,
      stars: stars,
      title: title.slice(0, 300),
      body: body.slice(0, 4000),
      dateRaw: dateText,
      date: parseDate(dateText),
      country: parseCountry(dateText),
      verified: verified,
      vine: vine,
      helpful: helpful || 0,
      variant: variant.slice(0, 160),
      images: images,
      video: video > 0,
      name: name.slice(0, 80),
      profile: pm ? pm[1] : ''
    };
  }

  /* ---------- Product page ---------- */
  function getAsin() {
    var inp = q(document, '#ASIN, input[name="ASIN"], input[name="ASIN.0"]');
    var v = inp && inp.value;
    if (v && /^[A-Z0-9]{10}$/i.test(v)) return v.toUpperCase();
    var m = location.href.match(/\/(?:dp|gp\/product|gp\/aw\/d|product-reviews|portal\/customer-reviews)\/([A-Z0-9]{10})/i);
    return m ? m[1].toUpperCase() : null;
  }

  function parseHistogram(doc) {
    var root = q(doc, '#histogramTable') || q(doc, '[data-hook="cr-histogram"]') || q(doc, '#cm_cr_dp_d_rating_histogram') ||
      q(doc, '.cr-widget-Histogram') || q(doc, '[id*="histogram"]');
    if (!root) return null;
    var STAR = /([1-5])\s*(?:Sternen?|Stern|stars?|[ée]toiles?|stelle|estrellas?|sterren|gwiazdk\w*)/i;
    var PCT = /(\d{1,3})\s*(?:%|Prozent|percent|pour ?cent|per ?cento|por ?ciento|procent)/i;
    var h = {};
    qa(root, 'li, tr, a[aria-label], [role="row"], [role="link"]').forEach(function (row) {
      var t = clean((row.getAttribute('aria-label') || '') + ' ' + row.textContent);
      var s = t.match(STAR), p = t.match(PCT);
      if (s && p && h[s[1]] === undefined) h[s[1]] = Math.min(100, +p[1]);
    });
    if (Object.keys(h).length < 5) {
      var t = clean(root.textContent);
      var re = /([1-5])\s*(?:Sternen?|Stern|stars?|[ée]toiles?|stelle|estrellas?|sterren)\D{0,40}?(\d{1,3})\s*%/gi, m;
      while ((m = re.exec(t))) { if (h[m[1]] === undefined) h[m[1]] = +m[2]; }
    }
    // aria-valuenow of the bars as a last fallback
    if (Object.keys(h).length < 3) {
      var meters = qa(root, '[aria-valuenow]');
      if (meters.length === 5) meters.forEach(function (mt, i) { h[5 - i] = parseInt(mt.getAttribute('aria-valuenow'), 10) || 0; });
    }
    if (Object.keys(h).length < 3) return null;
    var out = {}, sum = 0;
    for (var k = 1; k <= 5; k++) { out[k] = h[k] !== undefined ? h[k] : 0; sum += out[k]; }
    out.sum = sum;
    return out;
  }

  function parseAvg(doc) {
    var cands = ['[data-hook="rating-out-of-text"]', '#acrPopover', '[data-hook="average-star-rating"]', '#averageCustomerReviews .a-icon-alt', '#acrPopover .a-icon-alt'];
    for (var i = 0; i < cands.length; i++) {
      var el = q(doc, cands[i]);
      if (!el) continue;
      var t = clean((el.getAttribute('title') || '') + ' ' + el.textContent);
      var m = t.match(/(\d)[.,](\d)\s*(?:von|out of|sur|su|de|van|z)\s*5/i) || t.match(/\b(\d)[.,](\d)\b/);
      if (m) return parseFloat(m[1] + '.' + m[2]);
    }
    return null;
  }
  function parseTotal(doc) {
    var cands = ['[data-hook="total-review-count"]', '#acrCustomerReviewText', '[data-hook="cr-filter-info-review-rating-count"]', '#acrCustomerReviewLink'];
    for (var i = 0; i < cands.length; i++) {
      var el = q(doc, cands[i]);
      if (el) { var n = parseCount(el.textContent); if (n !== null) return n; }
    }
    return null;
  }
  function parseBought(text) {
    var t = clean(text);
    var m = t.match(/(\d[\d.,]*)\s*(K|Tsd\.?|Mio\.?|M)?\s*\+\s*(?:Mal\s+)?(?:im\s+letzten\s+Monat\s+gekauft|bought\s+in\s+past\s+month|achet[ée]s?\s+au\s+cours\s+du\s+mois\s+dernier|acquistat\w*\s+nel(?:l')?\s*ultimo\s+mese|comprad\w*\s+el\s+mes\s+pasado)/i) ||
      t.match(/(?:Mehr als|Über)\s+(\d[\d.,]*)\s*(K|Tsd\.?|Mio\.?)?\s*(?:Mal\s+)?im\s+letzten\s+Monat\s+gekauft/i) ||
      t.match(/(\d[\d.,]*)\s*(K|Tsd\.?|Mio\.?)?\s*\+?\s*Mal\s+im\s+letzten\s+Monat\s+gekauft/i);
    if (!m) return null;
    var num = parseFloat(m[1].replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'));
    var mult = m[2] ? (/^(K|Tsd)/i.test(m[2]) ? 1000 : 1000000) : 1;
    return { value: Math.round(num * mult), raw: m[0] };
  }
  function parseFirstAvailable() {
    var box = q(document, '#detailBullets_feature_div, #detailBulletsWrapper_feature_div, #productDetails_feature_div, #prodDetails, #productDetails_detailBullets_sections1, #productOverview_feature_div');
    var sources = [box ? box.textContent : '', document.body ? document.body.textContent : ''];
    var re = /(Im Angebot von Amazon\.[a-z.]+ seit|Date First Available|Disponible (?:sur Amazon\.fr )?depuis le|Disponibile su Amazon\.it a partire dal|Producto en Amazon\.es desde|Datum eerste beschikbaarheid)\s*:?\s*(.{4,40}?\d{4})/i;
    for (var i = 0; i < sources.length; i++) {
      var m = clean(sources[i]).match(re);
      if (m) return { date: parseDate(m[2]), raw: clean(m[2]) };
    }
    return null;
  }

  /* ---------- Detect blocks ---------- */
  function detectBlocks(doc, url) {
    url = url || location.href;
    var body = doc.body ? clean(doc.body.textContent).slice(0, 20000) : '';
    var hasContent = !!(q(doc, '#productTitle') || q(doc, REVIEW_SEL));
    var b = {};
    if (/\/ap\/signin|\/ap\/mfa|\/ax\/claim/i.test(url) || q(doc, 'form[name="signIn"], #ap_email, #ap_email_login, #signInSubmit')) b.signin = true;
    if (!hasContent && (q(doc, 'form[action*="validateCaptcha"], #captchacharacters') ||
      /Geben Sie die (angezeigten )?Zeichen|Enter the characters you see|not a robot|kein Roboter|um mit dem Einkaufen fortzufahren|to continue shopping|Weiter shoppen|Continue shopping/i.test(body))) b.captcha = true;
    if (/(weitere|mehr) Rezensionen[^.]{0,80}(Anfrage|anfordern)|Anfrage[^.]{0,80}(weitere|mehr) Rezensionen|request to see more reviews|see more reviews,? you can send a request/i.test(body)) b.restricted = true;
    if (!hasContent && /Suchen Sie etwas\?|Looking for something\?|Seite nicht gefunden|Page Not Found/i.test(body)) b.notFound = true;
    return b;
  }

  function hooks(doc) {
    var set = {};
    qa(doc, '[data-hook]').forEach(function (e) { set[e.getAttribute('data-hook')] = 1; });
    return Object.keys(set).slice(0, 150);
  }
  function diag(doc) {
    doc = doc || document;
    try {
      var h = q(doc, '#histogramTable, [data-hook="cr-histogram"], [id*="histogram"]');
      var r = q(doc, REVIEW_SEL);
      return {
        url: location.href,
        title: doc.title,
        ua: navigator.userAgent,
        counts: {
          reviews: qa(doc, REVIEW_SEL).length,
          productTitle: !!q(doc, '#productTitle'),
          histogram: !!h,
          totalCount: !!q(doc, '[data-hook="total-review-count"], #acrCustomerReviewText')
        },
        hooks: hooks(doc),
        histHtml: h ? h.outerHTML.replace(/\s+/g, ' ').slice(0, 2500) : null,
        reviewHtml: r ? r.outerHTML.replace(/\s+/g, ' ').slice(0, 4000) : null
      };
    } catch (e) { return { error: String(e) }; }
  }

  function harvestInto(root, seen, list, source) {
    var added = 0;
    qa(root, REVIEW_SEL).forEach(function (el) {
      // count nested matches (customer_review-… inside data-hook="review") only once
      if (el.parentElement && el.parentElement.closest && el.parentElement.closest(REVIEW_SEL)) return;
      var r = null;
      try { r = parseReview(el); } catch (e) { r = null; }
      if (r && !seen[r.id]) { seen[r.id] = 1; r.source = source; list.push(r); added++; }
    });
    return added;
  }

  async function productPhase() {
    progress(L.reading);
    await waitFor(function () {
      if (q(document, '#productTitle')) return true;
      var bl = detectBlocks(document);
      return !!(bl.captcha || bl.signin || bl.notFound);
    }, 25000, 2500);
    var blocks = detectBlocks(document);
    if (blocks.captcha || blocks.signin) return { phase: 'product', blocks: blocks, diag: diag() };
    var asin = getAsin();
    if (!q(document, '#productTitle') && !asin) return { phase: 'product', blocks: { notProduct: true }, diag: diag() };

    // Cookie banner: reject non-essential cookies (if present)
    try {
      var rej = q(document, '#sp-cc-rejectall-link, #sp-cc-rejectall-container a, button[data-cel-widget="sp-cc-rejectall"]');
      if (rej) rej.click();
    } catch (e) { /* ignore */ }

    // Scroll the review section into view (some parts load only then)
    var anchor = q(document, '#reviewsMedley, #customerReviews, #cm-cr-dp-review-list, #customer-reviews_feature_div, #cr-dp-review-list');
    if (anchor && anchor.scrollIntoView) anchor.scrollIntoView();
    else window.scrollTo(0, Math.round((document.body ? document.body.scrollHeight : 4000) * 0.6));
    progress(L.waiting);
    var noReviews = function () {
      return !!q(document, '#cr-no-reviews, [data-hook="no-reviews-section"], #dp-no-customer-review-yet');
    };
    var steps = 0;
    await waitFor(function () {
      steps++;
      if (steps === 10 || steps === 20) window.scrollBy(0, 700);
      return noReviews() || (!!q(document, REVIEW_SEL) && !!q(document, '#histogramTable, [data-hook="total-review-count"]'));
    }, 9000, 5000);
    await sleep(300);   // let the rest of the review list render

    var seen = {}, list = [];
    harvestInto(document, seen, list, 'top');

    var accText = textOf(q(document, '#nav-link-accountList-nav-line-1, #nav-link-accountList .nav-line-1'));
    var loggedIn = !!accText && !/anmelden|sign in|identifiez|accedi|identif[íi]cate|inloggen|zaloguj/i.test(accText);

    var by = textOf(q(document, '#bylineInfo'));
    var brand = (by.match(/Besuche den (.+?)-Store/i) || by.match(/Visit the (.+?) Store/i) ||
      by.match(/(?:Marke|Brand|Marque|Marca|Merk)\s*:\s*(.+)/i) || [null, by])[1] || '';
    var seller = textOf(q(document, '#sellerProfileTriggerId')) ||
      textOf(q(document, '#merchantInfoFeature_feature_div .offer-display-feature-text-message, #merchant-info'));
    var boughtEl = q(document, '#social-proofing-faceout-title-tk_bought, [id*="social-proofing-faceout"]');
    var bought = parseBought(boughtEl ? boughtEl.textContent : '') ||
      parseBought(textOf(q(document, '#centerCol, #ppd')).slice(0, 30000));
    var first = parseFirstAvailable();
    var hasVariations = !!q(document, '#twister .a-button-toggle, #twister li[data-defaultasin], #twister li[data-asin], #inline-twister-expander-content li, [id^="inline-twister-row"], #variation_color_name li, #variation_size_name li, #variation_style_name li');

    return {
      phase: 'product',
      ok: true,
      blocks: blocks,
      loggedIn: loggedIn,
      product: {
        url: location.href,
        origin: location.origin,
        domain: location.hostname.replace(/^www\./, ''),
        asin: asin,
        title: textOf(q(document, '#productTitle')) || clean(document.title).replace(/^Amazon\.[a-z.]+\s*:\s*/i, ''),
        brand: clean(brand).slice(0, 80),
        seller: seller.slice(0, 80),
        avg: parseAvg(document),
        total: parseTotal(document),
        histogram: parseHistogram(document),
        bought: bought ? bought.value : null,
        boughtRaw: bought ? bought.raw : '',
        firstAvailable: first ? first.date : null,
        firstAvailableRaw: first ? first.raw : '',
        hasVariations: hasVariations
      },
      reviews: list,
      diag: diag()
    };
  }

  function findShowMore() {
    var b = q(document, '[data-hook="show-more-button"], [data-hook="see-more-reviews-button"], [data-hook="load-more-reviews-button"]');
    if (!b) return null;
    var clickable = b.matches && b.matches('a, button, input') ? b : (q(b, 'a, button, input') || b);
    if (clickable.disabled || clickable.getAttribute('aria-disabled') === 'true') return null;
    if (clickable.offsetParent === null && getComputedStyle(clickable).position !== 'fixed') return null;
    return clickable;
  }
  function findNext(doc) {
    var a = q(doc, '[data-hook="pagination-bar"] li.a-last:not(.a-disabled) a, ul.a-pagination li.a-last:not(.a-disabled) a, #cm_cr-pagination_bar li.a-last:not(.a-disabled) a');
    if (!a) return null;
    var href = a.getAttribute('href');
    if (!href || href === '#') return null;
    try { return new URL(href, location.origin).href; } catch (e) { return null; }
  }

  async function reviewPhase() {
    var target = OPTS.target || 20;
    var maxRounds = OPTS.maxRounds || 3;
    var label = OPTS.label || L.loading;
    progress(label + ' …');
    await waitFor(function () {
      if (q(document, REVIEW_SEL)) return true;
      var bl = detectBlocks(document);
      return !!(bl.captcha || bl.signin || bl.restricted);
    }, 20000, 2500);
    if (q(document, REVIEW_SEL)) await sleep(300);
    var blocks = detectBlocks(document);
    if (blocks.captcha || blocks.signin || blocks.restricted) return { phase: OPTS.phase, blocks: blocks, reviews: [], diag: diag() };

    var seen = {}, list = [];
    harvestInto(document, seen, list, OPTS.phase);
    var doc = document, rounds = 0, pages = 1;
    while (list.length < target && rounds < maxRounds) {
      rounds++;
      var btn = doc === document ? findShowMore() : null;
      var next = findNext(doc);
      if (btn) {
        await sleep(rand(1800, 3200));
        progress(label + ' (' + list.length + ') …');
        var before = qa(document, REVIEW_SEL).length;
        btn.click();
        var grew = false;
        for (var k = 0; k < 20; k++) {
          await sleep(400);
          if (qa(document, REVIEW_SEL).length > before) { grew = true; break; }
        }
        await sleep(500);
        var bl2 = detectBlocks(document);
        if (bl2.restricted || bl2.captcha) { blocks = bl2; break; }
        if (!grew || harvestInto(document, seen, list, OPTS.phase) === 0) break;
        pages++;
      } else if (next) {
        await sleep(rand(1800, 3200));
        progress(label + ' (' + list.length + ') …');
        var res = await fetch(next, { credentials: 'include' });
        var html = await res.text();
        var nd = new DOMParser().parseFromString(html, 'text/html');
        var bl3 = detectBlocks(nd, res.url);
        if (bl3.captcha || bl3.signin || bl3.restricted) { blocks = bl3; break; }
        if (harvestInto(nd, seen, list, OPTS.phase) === 0) break;
        pages++;
        doc = nd;
      } else {
        break;
      }
    }
    return { phase: OPTS.phase, ok: true, blocks: blocks, reviews: list, pages: pages, diag: diag() };
  }

  (async function () {
    try {
      var res = OPTS.phase === 'product' ? await productPhase() : await reviewPhase();
      if (res) res.ms = Date.now() - T0;
      window.__RC_RESULT = res;
    } catch (e) {
      window.__RC_RESULT = { phase: OPTS.phase, error: String((e && (e.stack || e.message)) || e), diag: diag() };
    } finally {
      window.__RC_STATE = 'done';
    }
  })();
  return 'started';
})();
