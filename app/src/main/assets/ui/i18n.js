/*
 * Rezi-Check – Übersetzungen (Deutsch / Englisch).
 * t(key, params): Platzhalter {name} werden ersetzt; Zahlen und ISO-Datumsangaben
 * werden passend zur Sprache formatiert. Pluralformen: key_one / key_other über params.n.
 */
(function (root) {
  'use strict';
  var NB = ' ';

  var D = {
    de: {
      /* ---------- Analyse ---------- */
      'common.noReviews': 'Keine Rezensionen zum Durchsuchen.',
      'common.deepOnly': 'Nur im Modus „Gründlich“ mit Anmeldung prüfbar.',
      'common.tooFew': 'Zu wenige Rezensionen.',
      'space': ' ',

      'check.bribe.title': 'Gekaufte Bewertungen gemeldet?',
      'bribe.ok': 'Kein Käufer berichtet von Geld, Gutscheinen oder Beipackzetteln für gute Bewertungen.',
      'bribe.hit_one': 'Eine Rezension berichtet von Geld, Gutscheinen, Beipack-Karten oder der Bitte, eine Bewertung zu ändern. Das ist bei Amazon verboten – und ein starker Hinweis, dass auch andere Bewertungen „erkauft“ sind.',
      'bribe.hit_other': '{n} Rezensionen berichten von Geld, Gutscheinen, Beipack-Karten oder der Bitte, eine Bewertung zu ändern. Das ist bei Amazon verboten – und ein starker Hinweis, dass auch andere Bewertungen „erkauft“ sind.',

      'check.claims.title': 'Käufer zweifeln an den Bewertungen',
      'claims.ok': 'Niemand bezeichnet die Bewertungen als gekauft oder gefälscht.',
      'claims.hit_one': 'Ein Käufer hält die Bewertungen für gekauft oder gefälscht. Subjektiv – aber ein Grund, genauer hinzusehen.',
      'claims.hit_other': '{n} Käufer halten die Bewertungen für gekauft oder gefälscht. Subjektiv – aber ein Grund, genauer hinzusehen.',

      'check.incent.title': 'Produkt gratis bekommen',
      'incent.na': 'Keine positiven Rezensionen in der Stichprobe.',
      'incent.ok': 'Keine positive Rezension (außerhalb von Amazon Vine) erwähnt ein Gratis- oder Testprodukt.',
      'incent.hit_one': 'Eine von {total} positiven Rezensionen ({pct}' + NB + '%) stammt von jemandem, der das Produkt gratis oder vergünstigt bekommen hat – außerhalb von Amazons Vine-Programm ist das nicht erlaubt.',
      'incent.hit_other': '{n} von {total} positiven Rezensionen ({pct}' + NB + '%) stammen von Leuten, die das Produkt gratis oder vergünstigt bekommen haben – außerhalb von Amazons Vine-Programm ist das nicht erlaubt.',

      'check.verified.title': 'Verifizierte Käufe',
      'verified.na': 'Zu wenige Rezensionen für eine Aussage ({count}).',
      'verified.base': '{pct}' + NB + '% der Rezensionen sind „Verifizierte Käufe“ ({un} von {count} ohne Kaufnachweis).',
      'verified.bad': ' Ungewöhnlich viele – nicht verifizierte Rezensionen lassen sich leicht fälschen.',
      'verified.warn': ' Etwas mehr als üblich.',

      'check.vine.title': 'Amazon-Vine-Tester',
      'vine.ok': 'Keine Vine-Rezensionen in der Stichprobe.',
      'vine.base_one': 'Eine von {total} Rezensionen ({pct}' + NB + '%) stammt aus Amazon Vine: Tester bekommen das Produkt gratis. Das ist erlaubt, fällt aber oft wohlwollender aus.',
      'vine.base_other': '{n} von {total} Rezensionen ({pct}' + NB + '%) stammen aus Amazon Vine: Tester bekommen das Produkt gratis. Das ist erlaubt, fällt aber oft wohlwollender aus.',
      'vine.gap': ' Vine-Tester vergeben hier im Schnitt {va}' + NB + '★, alle anderen nur {na}' + NB + '★.',

      'check.dup.title': 'Ähnliche oder kopierte Texte',
      'dup.na': 'Zu wenige längere Rezensionen zum Vergleichen.',
      'dup.ok': 'Keine auffällig ähnlichen Texte unter {count} längeren Rezensionen.',
      'dup.hit': '{count} Rezensionen verschiedener Personen ähneln sich stark im Wortlaut – typisch für Bewertungen nach Vorlage.',

      'check.hist.title': 'Sterneverteilung',
      'hist.notFound': 'Sterneverteilung nicht gefunden.',
      'hist.tooFew': 'Zu wenige Bewertungen ({total}) für eine Aussage.',
      'hist.fewFour': 'Fast nur 5 Sterne und kaum 4 Sterne ({h5}' + NB + '% zu {h4}' + NB + '%). Zufriedene echte Käufer vergeben meist auch öfter 4 Sterne.',
      'hist.polar': '„Top oder Flop“: {h5}' + NB + '% 5 Sterne, aber {h1}' + NB + '% 1 Stern und kaum Mittelfeld – typisch, wenn gute Bewertungen eingekauft werden und echte Käufer enttäuscht sind.',
      'hist.high': 'Sehr hoher 5-Sterne-Anteil ({h5}' + NB + '%). Kann echt sein, ist aber ungewöhnlich.',
      'hist.ok': 'Die Verteilung ({h5}' + NB + '% 5★, {h4}' + NB + '% 4★, {h1}' + NB + '% 1★) wirkt natürlich.',

      'check.trend.title': 'Neue vs. alte Bewertungen',
      'trend.base': 'Die neuesten {count} Rezensionen liegen im Schnitt bei {ra}' + NB + '★, alle Bewertungen zusammen bei {ha}' + NB + '★.',
      'trend.bad': ' Deutlich schlechter: Ältere (womöglich gekaufte) Bewertungen halten den Schnitt hoch – oder die Qualität hat nachgelassen.',
      'trend.warn': ' Spürbar schlechter als der Gesamtschnitt.',

      'check.burst.title': 'Zeitliche Häufung',
      'burst.short': 'Die letzten {count} Rezensionen verteilen sich auf wenige Tage – bei so vielen Bewertungen ist keine Häufung erkennbar.',
      'burst.base': '{k} der letzten {count} Rezensionen kamen innerhalb von 3 Tagen (ab {from}), davon {five}× 5 Sterne.',
      'burst.bad': ' Solche Wellen entstehen oft durch Bewertungs-Kampagnen (aber auch Aktionstage wie Prime Day können Spitzen erzeugen).',
      'burst.warn': ' Auffällige Häufung positiver Rezensionen.',
      'burst.ok': 'Die neuesten Rezensionen verteilen sich gleichmäßig über die Zeit.',

      'check.hijack.title': 'Rezensionen älter als das Produkt',
      'hijack.na': 'Listungsdatum nicht gefunden.',
      'hijack.ok': 'Alle Rezensionen sind jünger als die Listung (seit {since}).',
      'hijack.hit_one': 'Eine Rezension ist älter als das Produkt selbst (bei Amazon seit {since}). Vermutlich wurden Bewertungen von einem anderen Produkt übernommen („Review-Hijacking“ oder Zusammenlegen von Varianten).',
      'hijack.hit_other': '{n} Rezensionen sind älter als das Produkt selbst (bei Amazon seit {since}). Vermutlich wurden Bewertungen von einem anderen Produkt übernommen („Review-Hijacking“ oder Zusammenlegen von Varianten).',
      'hijack.variants_one': 'Eine Rezension ist älter als diese Variante (bei Amazon seit {since}). Bei Produkten mit Varianten teilen sich alle Varianten die Rezensionen – das kann also harmlos sein. Prüfe, ob die alten Rezensionen wirklich zu diesem Produkt passen.',
      'hijack.variants_other': '{n} Rezensionen sind älter als diese Variante (bei Amazon seit {since}). Bei Produkten mit Varianten teilen sich alle Varianten die Rezensionen – das kann also harmlos sein. Prüfe, ob die alten Rezensionen wirklich zu diesem Produkt passen.',

      'check.velocity.title': 'Bewertungen im Verhältnis zu Verkäufen',
      'velocity.na': 'Listungsdatum oder Anzahl der Bewertungen fehlt.',
      'velocity.base': 'Seit {since} im Angebot: {total} Bewertungen, also etwa {pm} pro Monat.',
      'velocity.bought': ' Laut Amazon wurde es zuletzt über {b}-mal im Monat gekauft.',
      'velocity.warn': ' Das sind mehr Bewertungen pro Monat als Verkäufe – normalerweise bewertet nur ein kleiner Teil der Käufer.',
      'velocity.info': ' Ungewöhnlich viele Bewertungen im Verhältnis zu den Verkäufen.',
      'velocity.infoVariants': ' Ungewöhnlich viele Bewertungen im Verhältnis zu den Verkäufen (allerdings zählen Bewertungen aller Varianten zusammen).',
      'velocity.ok': ' Das passt zusammen.',
      'velocity.fast': ' Sehr viele Bewertungen in sehr kurzer Zeit.',

      'check.generic.title': 'Lob ohne Inhalt',
      'generic.na': 'Zu wenige 5-Sterne-Rezensionen.',
      'generic.base': '{n} von {total} 5-Sterne-Rezensionen bestehen aus höchstens sechs Wörtern.',
      'generic.info': ' Viel Lob ohne Details ist ein schwaches Warnsignal.',
      'generic.ok': 'Die 5-Sterne-Rezensionen enthalten überwiegend konkrete Angaben.',

      'grade.A.label': 'Unauffällig', 'grade.A.text': 'Keine typischen Fake-Muster gefunden.',
      'grade.B.label': 'Größtenteils unauffällig', 'grade.B.text': 'Einzelne Hinweise, aber nichts Gravierendes.',
      'grade.C.label': 'Gemischt', 'grade.C.text': 'Einige Warnsignale – lies vor allem die kritischen Rezensionen.',
      'grade.D.label': 'Deutliche Warnsignale', 'grade.D.text': 'Die Bewertungen sind wahrscheinlich teilweise geschönt.',
      'grade.F.label': 'Sehr verdächtig', 'grade.F.text': 'Starke Hinweise auf manipulierte Bewertungen.',
      'grade.none.label': 'Zu wenig Daten', 'grade.none.text': 'Für eine Einschätzung fehlen Bewertungen oder Rezensionen.',

      'conf.high': 'hoch', 'conf.medium': 'mittel', 'conf.low': 'gering',
      'conf.checked_one': 'Eine Rezension geprüft.',
      'conf.checked_other': '{n} Rezensionen geprüft.',
      'conf.few_one': 'Nur eine Rezension sichtbar – Amazon zeigt ohne Anmeldung nur wenige.',
      'conf.few_other': 'Nur {n} Rezensionen sichtbar – Amazon zeigt ohne Anmeldung nur wenige.',
      'adj.basis.newest': 'neuesten Rezensionen',
      'adj.basis.visible': 'sichtbaren Rezensionen',

      'note.restricted': '{store} zeigt deinem Konto gerade nur wenige Rezensionen (Schutz vor automatischem Auslesen). Dort kannst du die Freigabe anfordern – nutze „Gründlich“ eine Weile nicht.',
      'note.needsLogin': 'Für „Gründlich“ (mehr Rezensionen, Trend und zeitliche Häufung) musst du dich in der App bei {store} anmelden.',
      'note.noHist': 'Die Sterneverteilung konnte nicht gelesen werden.',
      'note.noText': 'Es konnten keine Rezensionstexte gelesen werden. Möglicherweise hat Amazon die Seite umgebaut – kopiere die Diagnose und melde das Problem auf GitHub.',
      'note.errors': 'Hinweis: {list}',
      'err.reviews_load_failed': 'Weitere Rezensionen konnten nicht geladen werden.',
      'err.reviews_timeout': 'Das Nachladen weiterer Rezensionen hat zu lange gedauert.',
      'err.reviews_script': 'Weitere Rezensionen konnten nicht ausgelesen werden.',

      /* ---------- Oberfläche ---------- */
      'app.sub': 'Prüft, ob die Bewertungen eines Amazon-Produkts echt wirken.',
      'form.aria': 'Produkt prüfen',
      'form.label': 'Amazon-Link',
      'form.placeholder': '{short} oder {store}/dp/…',
      'form.paste': 'Einfügen',
      'form.mode': 'Gründlichkeit',
      'mode.quick': 'Schnell',
      'mode.deep': 'Gründlich',
      'hint.quick': 'Nur die Produktseite, ohne Anmeldung. Amazon zeigt dort rund 10 Rezensionen.',
      'hint.deep': 'Lädt zusätzlich bis zu 50 kritische und neueste Rezensionen. Dafür musst du in Rezi-Check bei Amazon angemeldet sein.',
      'hint.notLoggedIn': ' Du bist bei {store} noch nicht angemeldet.',
      'form.go': 'Prüfen',
      'acc.aria': 'Amazon-Konto',
      'acc.on': '{store}: angemeldet',
      'acc.off': '{store}: nicht angemeldet',
      'acc.signIn': 'Anmelden',
      'acc.signOut': 'Abmelden',
      'tip_html': 'Am schnellsten geht’s aus der Amazon-App: Produkt öffnen, auf <b>Teilen</b> tippen und <b>Rezi-Check</b> wählen.',
      'hist.title': 'Zuletzt geprüft',
      'hist.empty': 'Noch nichts geprüft. Füge oben einen Link ein oder teile ein Produkt aus der Amazon-App.',
      'hist.clear': 'Verlauf löschen',
      'settings.title': 'Einstellungen',
      'settings.lang': 'Sprache',
      'settings.langAuto': 'Automatisch ({name})',
      'settings.store': 'Amazon-Shop',
      'settings.storeHint': 'Bei diesem Shop meldest du dich für „Gründlich“ an.',
      'foot.text': 'Rezi-Check sucht nach typischen Mustern gefälschter Bewertungen. Das Ergebnis ist eine Einschätzung, kein Beweis. Alle Daten bleiben auf deinem Handy.',
      'foot.version': 'Version {v}',
      'busy.title': 'Prüfe Rezensionen …',
      'busy.opening': 'Öffne Amazon …',
      'busy.cancel': 'Abbrechen',
      'res.back': 'Zurück',
      'res.share': 'Teilen',
      'res.unknown': 'Unbekanntes Produkt',
      'res.rating': '{avg} von 5, {total} Bewertungen',
      'res.points': '{score} von 100 Punkten. ',
      'res.conf': 'Aussagekraft {level}: {text}',
      'res.findings': 'Befunde',
      'res.none': 'Keine Auffälligkeiten gefunden.',
      'res.groupOk': 'Unauffällig',
      'res.groupNa': 'Nicht geprüft',
      'res.hist': 'Sterneverteilung',
      'res.adj_html': 'Ohne auffällige Rezensionen: <b>{clean}' + NB + '★</b> statt {all}' + NB + '★',
      'res.adjBasis': 'Grundlage: {nClean} von {nAll} {basis} (verifiziert, kein Vine, kein Gratis-Hinweis, keine Kopie).',
      'res.critical': 'Kritische Stimmen',
      'res.noCritical': 'Keine Rezension mit 1 oder 2 Sternen in der Stichprobe.',
      'res.open': 'Bei Amazon öffnen',
      'res.again': 'Erneut prüfen',
      'res.diag': 'Diagnose kopieren',
      'res.disclaimer': 'Rezi-Check sucht nach typischen Mustern gefälschter Bewertungen. Das ist eine Einschätzung, kein Beweis. Geprüft am {date}.',
      'res.penalty': '{n} Punkte Abzug',
      'res.gradeAria': 'Note {g}',
      'stamp.ring': 'GEPRÜFT • {date} • REZI-CHECK • ',
      'ex.verified': 'verifizierter Kauf',
      'ex.unverified': 'nicht verifiziert',
      'ex.vine': 'Vine',
      'voice.helpful': '{n}× hilfreich',
      'stars.aria': '{n} Sterne',
      'share.head': 'Rezi-Check: Note {g} – {label}',
      'share.flagged': 'Auffällig: {list}',
      'share.note': '(Einschätzung anhand typischer Fake-Muster, kein Beweis.)',
      'err.retry': 'Erneut versuchen',
      'err.copyDiag': 'Diagnose kopieren',
      'err.report': 'Problem melden',
      'err.signIn': 'Anmelden',
      'err.quick': 'Schnell prüfen',
      'err.noUrl.t': 'Kein Amazon-Link erkannt',
      'err.noUrl.d': 'Kopiere den Link in der Amazon-App über „Teilen“ → „Link kopieren“ oder aus der Adresszeile des Browsers.',
      'err.deepLogin.t': 'Für „Gründlich“ anmelden',
      'err.deepLogin.d': 'Weitere Rezensionen zeigt Amazon nur angemeldeten Kunden. Melde dich einmalig in Rezi-Check an oder prüfe schnell ohne Anmeldung.',
      'err.not_product.t': 'Das ist keine Produktseite',
      'err.not_product.d': 'Unter dem Link wurde kein Amazon-Produkt gefunden. Öffne das Produkt in der Amazon-App und teile es von dort.',
      'err.load_failed.t': 'Amazon ist nicht erreichbar',
      'err.load_failed.d': 'Die Seite konnte nicht geladen werden. Prüfe deine Internetverbindung und versuch es erneut.',
      'err.timeout.t': 'Amazon hat zu lange gebraucht',
      'err.timeout.d': 'Die Produktseite wurde nicht rechtzeitig fertig. Versuch es erneut – oft klappt es beim zweiten Mal.',
      'err.script.t': 'Auslesen fehlgeschlagen',
      'err.script.d': 'Die Seite sah anders aus als erwartet. Kopiere die Diagnose und melde das Problem auf GitHub.',
      'err.captcha.t': 'Sicherheitsabfrage nicht gelöst',
      'err.captcha.d': 'Amazon wollte prüfen, ob du ein Mensch bist. Versuch es erneut und löse die Abfrage.',
      'err.signin.t': 'Amazon verlangt eine Anmeldung',
      'err.signin.d': 'Melde dich in Rezi-Check bei Amazon an und versuch es erneut.',
      'err.generic.t': 'Prüfung fehlgeschlagen',
      'err.unknown': 'Unbekannter Fehler.'
    },

    en: {
      'common.noReviews': 'No reviews to search.',
      'common.deepOnly': 'Only available in “Thorough” mode while signed in.',
      'common.tooFew': 'Too few reviews.',
      'space': ' ',

      'check.bribe.title': 'Paid reviews reported?',
      'bribe.ok': 'No buyer reports money, vouchers or package inserts being offered for good reviews.',
      'bribe.hit_one': 'One review reports money, vouchers, package insert cards or a request to change a review. That is against Amazon’s rules – and a strong sign that other reviews may have been bought too.',
      'bribe.hit_other': '{n} reviews report money, vouchers, package insert cards or requests to change a review. That is against Amazon’s rules – and a strong sign that other reviews may have been bought too.',

      'check.claims.title': 'Buyers doubt the reviews',
      'claims.ok': 'Nobody calls the reviews bought or fake.',
      'claims.hit_one': 'One buyer thinks the reviews are bought or fake. Subjective – but a reason to take a closer look.',
      'claims.hit_other': '{n} buyers think the reviews are bought or fake. Subjective – but a reason to take a closer look.',

      'check.incent.title': 'Got the product for free',
      'incent.na': 'No positive reviews in the sample.',
      'incent.ok': 'No positive review (outside Amazon Vine) mentions a free or test product.',
      'incent.hit_one': 'One of {total} positive reviews ({pct}%) comes from someone who got the product free or discounted – that is not allowed outside Amazon’s Vine program.',
      'incent.hit_other': '{n} of {total} positive reviews ({pct}%) come from people who got the product free or discounted – that is not allowed outside Amazon’s Vine program.',

      'check.verified.title': 'Verified purchases',
      'verified.na': 'Too few reviews to tell ({count}).',
      'verified.base': '{pct}% of the reviews are “Verified Purchases” ({un} of {count} without proof of purchase).',
      'verified.bad': ' Unusually many – unverified reviews are easy to fake.',
      'verified.warn': ' Somewhat more than usual.',

      'check.vine.title': 'Amazon Vine testers',
      'vine.ok': 'No Vine reviews in the sample.',
      'vine.base_one': 'One of {total} reviews ({pct}%) comes from Amazon Vine: testers get the product for free. That is allowed, but often more favorable.',
      'vine.base_other': '{n} of {total} reviews ({pct}%) come from Amazon Vine: testers get the product for free. That is allowed, but often more favorable.',
      'vine.gap': ' Vine testers give {va}' + NB + '★ on average here, everyone else only {na}' + NB + '★.',

      'check.dup.title': 'Similar or copied texts',
      'dup.na': 'Too few longer reviews to compare.',
      'dup.ok': 'No suspiciously similar texts among {count} longer reviews.',
      'dup.hit': '{count} reviews by different people are worded very similarly – typical of reviews written from a template.',

      'check.hist.title': 'Star distribution',
      'hist.notFound': 'Star distribution not found.',
      'hist.tooFew': 'Too few ratings ({total}) to tell.',
      'hist.fewFour': 'Almost only 5 stars and hardly any 4 stars ({h5}% vs. {h4}%). Satisfied real buyers usually give 4 stars more often too.',
      'hist.polar': '“Love it or hate it”: {h5}% 5 stars, but {h1}% 1 star and hardly anything in between – typical when good reviews are bought and real buyers are disappointed.',
      'hist.high': 'Very high share of 5-star ratings ({h5}%). Can be genuine, but it is unusual.',
      'hist.ok': 'The distribution ({h5}% 5★, {h4}% 4★, {h1}% 1★) looks natural.',

      'check.trend.title': 'New vs. old reviews',
      'trend.base': 'The {count} newest reviews average {ra}' + NB + '★, all ratings together {ha}' + NB + '★.',
      'trend.bad': ' Clearly worse: older (possibly bought) reviews keep the average up – or the quality has dropped.',
      'trend.warn': ' Noticeably worse than the overall average.',

      'check.burst.title': 'Bursts over time',
      'burst.short': 'The last {count} reviews span only a few days – with this many reviews, no burst can be detected.',
      'burst.base': '{k} of the last {count} reviews came within 3 days (from {from}), {five} of them with 5 stars.',
      'burst.bad': ' Waves like this often come from review campaigns (though sales events like Prime Day can cause spikes too).',
      'burst.warn': ' A suspicious cluster of positive reviews.',
      'burst.ok': 'The newest reviews are spread evenly over time.',

      'check.hijack.title': 'Reviews older than the product',
      'hijack.na': 'Listing date not found.',
      'hijack.ok': 'All reviews are newer than the listing (since {since}).',
      'hijack.hit_one': 'One review is older than the product itself (on Amazon since {since}). Reviews were probably taken over from another product (“review hijacking” or merged variants).',
      'hijack.hit_other': '{n} reviews are older than the product itself (on Amazon since {since}). Reviews were probably taken over from another product (“review hijacking” or merged variants).',
      'hijack.variants_one': 'One review is older than this variant (on Amazon since {since}). Products with variants share their reviews, so this can be harmless. Check whether the old reviews really match this product.',
      'hijack.variants_other': '{n} reviews are older than this variant (on Amazon since {since}). Products with variants share their reviews, so this can be harmless. Check whether the old reviews really match this product.',

      'check.velocity.title': 'Ratings compared to sales',
      'velocity.na': 'Listing date or number of ratings missing.',
      'velocity.base': 'Listed since {since}: {total} ratings, about {pm} per month.',
      'velocity.bought': ' According to Amazon, it was bought more than {b} times last month.',
      'velocity.warn': ' That is more ratings per month than sales – normally only a small share of buyers leave a rating.',
      'velocity.info': ' Unusually many ratings compared to sales.',
      'velocity.infoVariants': ' Unusually many ratings compared to sales (although the ratings of all variants are counted together).',
      'velocity.ok': ' That fits.',
      'velocity.fast': ' A lot of ratings in a very short time.',

      'check.generic.title': 'Praise without substance',
      'generic.na': 'Too few 5-star reviews.',
      'generic.base': '{n} of {total} 5-star reviews have six words or fewer.',
      'generic.info': ' Lots of praise without details is a weak warning sign.',
      'generic.ok': 'The 5-star reviews mostly contain specific details.',

      'grade.A.label': 'Looks genuine', 'grade.A.text': 'No typical fake-review patterns found.',
      'grade.B.label': 'Mostly genuine', 'grade.B.text': 'A few hints, but nothing serious.',
      'grade.C.label': 'Mixed', 'grade.C.text': 'Some warning signs – read the critical reviews in particular.',
      'grade.D.label': 'Clear warning signs', 'grade.D.text': 'The reviews are probably partly inflated.',
      'grade.F.label': 'Highly suspicious', 'grade.F.text': 'Strong signs of manipulated reviews.',
      'grade.none.label': 'Not enough data', 'grade.none.text': 'There are not enough ratings or reviews to judge.',

      'conf.high': 'high', 'conf.medium': 'medium', 'conf.low': 'low',
      'conf.checked_one': 'One review checked.',
      'conf.checked_other': '{n} reviews checked.',
      'conf.few_one': 'Only one review visible – Amazon shows only a few without signing in.',
      'conf.few_other': 'Only {n} reviews visible – Amazon shows only a few without signing in.',
      'adj.basis.newest': 'newest reviews',
      'adj.basis.visible': 'visible reviews',

      'note.restricted': '{store} is currently showing your account only a few reviews (protection against automated reading). You can request access there – don’t use “Thorough” for a while.',
      'note.needsLogin': 'For “Thorough” (more reviews, trend and bursts) you need to sign in to {store} in the app.',
      'note.noHist': 'The star distribution could not be read.',
      'note.noText': 'No review texts could be read. Amazon may have changed its pages – copy the diagnostics and report the problem on GitHub.',
      'note.errors': 'Note: {list}',
      'err.reviews_load_failed': 'More reviews could not be loaded.',
      'err.reviews_timeout': 'Loading more reviews took too long.',
      'err.reviews_script': 'More reviews could not be read.',

      'app.sub': 'Checks whether the reviews of an Amazon product look genuine.',
      'form.aria': 'Check a product',
      'form.label': 'Amazon link',
      'form.placeholder': '{short} or {store}/dp/…',
      'form.paste': 'Paste',
      'form.mode': 'Depth',
      'mode.quick': 'Quick',
      'mode.deep': 'Thorough',
      'hint.quick': 'Product page only, no sign-in needed. Amazon shows about 10 reviews there.',
      'hint.deep': 'Also loads up to 50 critical and newest reviews. For this you need to be signed in to Amazon in Rezi-Check.',
      'hint.notLoggedIn': ' You are not signed in to {store} yet.',
      'form.go': 'Check',
      'acc.aria': 'Amazon account',
      'acc.on': '{store}: signed in',
      'acc.off': '{store}: not signed in',
      'acc.signIn': 'Sign in',
      'acc.signOut': 'Sign out',
      'tip_html': 'Quickest from the Amazon app: open a product, tap <b>Share</b> and choose <b>Rezi-Check</b>.',
      'hist.title': 'Recently checked',
      'hist.empty': 'Nothing checked yet. Paste a link above or share a product from the Amazon app.',
      'hist.clear': 'Clear history',
      'settings.title': 'Settings',
      'settings.lang': 'Language',
      'settings.langAuto': 'Automatic ({name})',
      'settings.store': 'Amazon store',
      'settings.storeHint': 'This is the store you sign in to for “Thorough”.',
      'foot.text': 'Rezi-Check looks for typical patterns of fake reviews. The result is an estimate, not proof. All data stays on your phone.',
      'foot.version': 'Version {v}',
      'busy.title': 'Checking reviews …',
      'busy.opening': 'Opening Amazon …',
      'busy.cancel': 'Cancel',
      'res.back': 'Back',
      'res.share': 'Share',
      'res.unknown': 'Unknown product',
      'res.rating': '{avg} out of 5, {total} ratings',
      'res.points': '{score} of 100 points. ',
      'res.conf': 'Confidence: {level}. {text}',
      'res.findings': 'Findings',
      'res.none': 'No issues found.',
      'res.groupOk': 'Looks fine',
      'res.groupNa': 'Not checked',
      'res.hist': 'Star distribution',
      'res.adj_html': 'Without suspicious reviews: <b>{clean}' + NB + '★</b> instead of {all}' + NB + '★',
      'res.adjBasis': 'Based on {nClean} of {nAll} {basis} (verified, no Vine, no free-product note, no copy).',
      'res.critical': 'Critical voices',
      'res.noCritical': 'No 1- or 2-star reviews in the sample.',
      'res.open': 'Open on Amazon',
      'res.again': 'Check again',
      'res.diag': 'Copy diagnostics',
      'res.disclaimer': 'Rezi-Check looks for typical patterns of fake reviews. This is an estimate, not proof. Checked on {date}.',
      'res.penalty': '{n} points deducted',
      'res.gradeAria': 'Grade {g}',
      'stamp.ring': 'CHECKED • {date} • REZI-CHECK • ',
      'ex.verified': 'verified purchase',
      'ex.unverified': 'not verified',
      'ex.vine': 'Vine',
      'voice.helpful': '{n}× helpful',
      'stars.aria': '{n} stars',
      'share.head': 'Rezi-Check: grade {g} – {label}',
      'share.flagged': 'Flagged: {list}',
      'share.note': '(Estimate based on typical fake-review patterns, not proof.)',
      'err.retry': 'Try again',
      'err.copyDiag': 'Copy diagnostics',
      'err.report': 'Report problem',
      'err.signIn': 'Sign in',
      'err.quick': 'Quick check',
      'err.noUrl.t': 'No Amazon link found',
      'err.noUrl.d': 'Copy the link in the Amazon app via “Share” → “Copy link”, or from your browser’s address bar.',
      'err.deepLogin.t': 'Sign in for “Thorough”',
      'err.deepLogin.d': 'Amazon only shows more reviews to signed-in customers. Sign in once in Rezi-Check, or do a quick check without signing in.',
      'err.not_product.t': 'This is not a product page',
      'err.not_product.d': 'No Amazon product was found at this link. Open the product in the Amazon app and share it from there.',
      'err.load_failed.t': 'Amazon is not reachable',
      'err.load_failed.d': 'The page could not be loaded. Check your internet connection and try again.',
      'err.timeout.t': 'Amazon took too long',
      'err.timeout.d': 'The product page did not finish in time. Try again – it often works the second time.',
      'err.script.t': 'Reading the page failed',
      'err.script.d': 'The page looked different than expected. Copy the diagnostics and report the problem on GitHub.',
      'err.captcha.t': 'Security check not solved',
      'err.captcha.d': 'Amazon wanted to check that you are human. Try again and solve the challenge.',
      'err.signin.t': 'Amazon requires you to sign in',
      'err.signin.d': 'Sign in to Amazon in Rezi-Check and try again.',
      'err.generic.t': 'Check failed',
      'err.unknown': 'Unknown error.'
    }
  };

  var DECIMAL = { avg: 1, ra: 1, ha: 1, va: 1, na: 1, clean: 1, all: 1 };
  var lang = 'de';

  function setLang(l) { lang = l === 'en' ? 'en' : 'de'; }
  function getLang() { return lang; }
  function locale() { return lang === 'en' ? 'en-US' : 'de-DE'; }

  function formatNumber(v, decimals) {
    if (v == null || isNaN(v)) return '–';
    return Number(v).toLocaleString(locale(), { minimumFractionDigits: decimals || 0, maximumFractionDigits: decimals || 0 });
  }
  function formatDate(v) {
    var d = typeof v === 'number' ? new Date(v) : new Date(String(v).slice(0, 10) + 'T12:00:00Z');
    if (isNaN(d.getTime())) return '';
    if (lang === 'en') {
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    }
    return d.getUTCDate() + '.' + (d.getUTCMonth() + 1) + '.' + d.getUTCFullYear();
  }
  function fmt(name, v) {
    if (typeof v === 'number') return formatNumber(v, DECIMAL[name] ? 1 : 0);
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return formatDate(v);
    return v == null ? '–' : String(v);
  }
  function t(key, p) {
    var d = D[lang], s;
    if (p && typeof p.n === 'number') s = d[key + (p.n === 1 ? '_one' : '_other')];
    if (s === undefined) s = d[key];
    if (s === undefined) s = D.de[key + (p && p.n === 1 ? '_one' : '_other')] || D.de[key];
    if (s === undefined) return key;
    return s.replace(/\{(\w+)\}/g, function (m, k) { return fmt(k, p ? p[k] : undefined); });
  }
  function has(key) { return D[lang][key] !== undefined || D[lang][key + '_other'] !== undefined; }

  var api = { t: t, has: has, setLang: setLang, getLang: getLang, formatNumber: formatNumber, formatDate: formatDate, dict: D };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RC_I18N = api;
})(this);
