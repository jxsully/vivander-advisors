/* ============================================================
   Vivander Advisors: site search
   Indexes the site's own pages in the browser (no build step),
   suggests starter questions, and routes unanswered questions
   to the contact form with the question prefilled.
   ============================================================ */
(function () {
  "use strict";

  var PAGES = [
    "index.html",
    "services.html",
    "dont-be-invisible.html",
    "speaking.html",
    "books.html",
    "insights.html",
    "about.html",
    "contact.html"
  ];

  // Starter questions shown before the visitor types. Each runs a search.
  var LEADING_QUESTIONS = [
    { q: "Is my business showing up in ChatGPT?", search: "ChatGPT visibility" },
    { q: "How is AI Discovery different from SEO?", search: "SEO agency" },
    { q: "Can you train our executive team?", search: "training workshops" },
    { q: "Can Michael keynote our event?", search: "keynote" },
    { q: "What is Don't Be Invisible?", search: "Don't Be Invisible" }
  ];

  // Maps search words to the contact form's "Interested in" options.
  var TOPICS = [
    { words: ["discover", "visib", "chatgpt", "gemini", "perplexity", "seo", "invisible", "audit", "found", "search"], topic: "AI Discovery — visibility audit" },
    { words: ["train", "literacy", "workshop", "educat", "claude", "cowork", "brief"], topic: "AI Literacy — executive education" },
    { words: ["scal", "pilot", "workflow", "agent", "automat", "p&l", "roi"], topic: "AI Scaling — from pilot to profit" },
    { words: ["speak", "keynote", "event", "conference", "panel", "jetson"], topic: "Speaking / keynote" },
    { words: ["book", "bulk", "author", "hats"], topic: "Books & bulk orders" }
  ];

  var CACHE_KEY = "vv-search-index-v1";
  var MAX_RESULTS = 8;
  var STOP = { the: 1, a: 1, an: 1, and: 1, or: 1, of: 1, to: 1, in: 1, is: 1, my: 1, our: 1, we: 1, you: 1, your: 1, for: 1, on: 1, can: 1, do: 1, does: 1, what: 1, how: 1, i: 1, me: 1, it: 1, be: 1, with: 1, are: 1, from: 1 };

  var index = null;
  var indexPromise = null;
  var els = {};
  var activeIdx = -1;
  var lastTrigger = null;

  /* ---------- indexing ---------- */

  function norm(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  function pageTitle(doc) {
    var t = norm(doc.title);
    return norm(t.split(/\s[—|-]\s/)[0]) || t;
  }

  function extract(url, html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var title = pageTitle(doc);
    if (url === "index.html") title = "Home";
    var root = doc.body;
    ["nav", "footer", "script", "style", "noscript", "form", "select", "#vv-search"].forEach(function (sel) {
      Array.prototype.forEach.call(root.querySelectorAll(sel), function (n) { n.remove(); });
    });

    var sections = [];
    var cur = { heading: title, anchor: "", text: "" };
    var walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 1) {
        if (/^H[1-4]$/.test(node.tagName)) {
          if (norm(cur.text)) sections.push(cur);
          var holder = node.closest("[id]");
          cur = { heading: norm(node.textContent), anchor: holder ? holder.id : "", text: "" };
          walker.currentNode = lastDescendant(node);
        }
      } else {
        cur.text += " " + node.nodeValue;
      }
    }
    if (norm(cur.text)) sections.push(cur);

    return sections.map(function (s) {
      return {
        page: title,
        url: url + (s.anchor ? "#" + s.anchor : ""),
        heading: s.heading,
        text: norm(s.text)
      };
    });
  }

  function lastDescendant(n) {
    while (n.lastChild) n = n.lastChild;
    return n;
  }

  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (indexPromise) return indexPromise;
    try {
      var cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) { index = JSON.parse(cached); return Promise.resolve(index); }
    } catch (e) { /* storage unavailable */ }

    indexPromise = Promise.all(PAGES.map(function (url) {
      return fetch(url, { credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.text() : ""; })
        .then(function (html) { return html ? extract(url, html) : []; })
        .catch(function () { return []; });
    })).then(function (lists) {
      index = [].concat.apply([], lists);
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(index)); } catch (e) { /* ignore */ }
      return index;
    });
    return indexPromise;
  }

  /* ---------- searching ---------- */

  function tokens(q) {
    return norm(q.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9&\s-]/g, " "))
      .split(" ")
      .filter(function (t) { return t && !STOP[t] && t.length > 1; });
  }

  function stem(t) {
    return t.length > 4 ? t.replace(/(ing|ers|ed|es|s)$/, "") : t;
  }

  function search(q) {
    var toks = tokens(q).map(stem);
    if (!toks.length || !index) return [];
    var res = toks.map(function (t) { return wordRe(t); });
    var results = [];
    index.forEach(function (rec) {
      var head = rec.heading.toLowerCase().replace(/[’']/g, "");
      var page = rec.page.toLowerCase().replace(/[’']/g, "");
      var body = rec.text.toLowerCase().replace(/[’']/g, "");
      var score = 0, hits = 0;
      res.forEach(function (re) {
        var h = 0;
        if (re.test(page)) h += 4;
        if (re.test(head)) h += 6;
        var c = count(body, re);
        if (c) h += Math.min(c, 5);
        if (h) { hits++; score += h; }
      });
      if (!hits) return;
      if (hits === toks.length) score *= 2; // every word matched
      results.push({ rec: rec, score: score, hits: hits });
    });
    results.sort(function (a, b) { return b.hits - a.hits || b.score - a.score; });

    // One entry per URL keeps the list readable.
    var seen = {}, out = [];
    for (var i = 0; i < results.length && out.length < MAX_RESULTS; i++) {
      var r = results[i];
      if (seen[r.rec.url + "|" + r.rec.heading]) continue;
      seen[r.rec.url + "|" + r.rec.heading] = 1;
      out.push(r.rec);
    }
    return { items: out, toks: toks };
  }

  // Matches a token at the start of a word, so "scal" finds "scaling" and skips "escalate".
  function wordRe(t, flags) {
    return new RegExp("(^|[^a-z0-9])" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags || "");
  }

  function count(hay, re) {
    var m = hay.match(new RegExp(re.source, "g"));
    return m ? m.length : 0;
  }

  function guessTopic(q) {
    var s = q.toLowerCase();
    for (var i = 0; i < TOPICS.length; i++) {
      for (var j = 0; j < TOPICS[i].words.length; j++) {
        if (s.indexOf(TOPICS[i].words[j]) > -1) return TOPICS[i].topic;
      }
    }
    return "";
  }

  /* ---------- rendering ---------- */

  function esc(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function highlight(text, toks) {
    var out = esc(text);
    toks.forEach(function (t) {
      var re = new RegExp("(^|[^a-z0-9])(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[a-z0-9]*)", "gi");
      out = out.replace(re, "$1<mark>$2</mark>");
    });
    return out;
  }

  function snippet(text, toks) {
    var low = text.toLowerCase().replace(/[’']/g, "\u0000");
    var at = -1;
    for (var i = 0; i < toks.length && at < 0; i++) {
      var m = wordRe(toks[i]).exec(low);
      if (m) at = m.index + m[1].length;
    }
    var start = Math.max(0, at - 60);
    var s = text.slice(start, start + 170);
    if (start > 0) s = "…" + s.replace(/^\S*\s/, "");
    if (start + 170 < text.length) s = s.replace(/\s\S*$/, "") + "…";
    return s;
  }

  function contactHref(q) {
    var p = [];
    if (q) p.push("q=" + encodeURIComponent(q));
    var t = guessTopic(q);
    if (t) p.push("topic=" + encodeURIComponent(t));
    p.push("src=search");
    return "contact.html?" + p.join("&") + "#inquiry";
  }

  function renderAsk(q, strong) {
    var href = contactHref(q);
    if (strong) {
      els.ask.innerHTML =
        '<div class="vv-ask-q">We don\'t have a page on <strong>“' + esc(q) + '”</strong> yet.</div>' +
        '<p>Ask us directly. A partner reads every question and replies within one business day.</p>' +
        '<a class="btn btn-primary" href="' + href + '">Ask Vivander this question →</a>';
    } else if (q) {
      els.ask.innerHTML =
        '<div class="vv-ask-q">Is your question about <strong>“' + esc(q) + '”</strong> still open?</div>' +
        '<p>Send it to us. We reply personally within one business day.</p>' +
        '<a class="vv-ask-link" href="' + href + '">Ask Vivander directly →</a>';
    } else {
      els.ask.innerHTML =
        '<div class="vv-ask-q">What\'s the AI question on your leadership agenda?</div>' +
        '<p>Search the site, or ask us. A partner replies within one business day.</p>' +
        '<a class="vv-ask-link" href="' + href + '">Ask Vivander directly →</a>';
    }
    els.ask.classList.toggle("is-strong", !!strong);
  }

  function renderSuggestions() {
    activeIdx = -1;
    els.label.textContent = "Common questions";
    els.list.innerHTML = LEADING_QUESTIONS.map(function (l, i) {
      return '<li role="option" id="vv-opt-' + i + '"><button type="button" class="vv-suggest" data-search="' + esc(l.search) + '">' +
        '<span class="vv-q">' + esc(l.q) + '</span><span class="vv-arrow" aria-hidden="true">→</span></button></li>';
    }).join("");
    renderAsk("", false);
  }

  function render() {
    var q = norm(els.input.value);
    if (!q) { renderSuggestions(); return; }
    if (!index) {
      els.label.textContent = "Searching…";
      els.list.innerHTML = "";
      loadIndex().then(render);
      return;
    }
    var r = search(q);
    var items = r.items || [];
    activeIdx = -1;
    if (!items.length) {
      els.label.textContent = "No matching pages";
      els.list.innerHTML = "";
      renderAsk(q, true);
      return;
    }
    els.label.textContent = items.length + (items.length === 1 ? " result" : " results");
    els.list.innerHTML = items.map(function (rec, i) {
      var crumb = rec.heading && rec.heading !== rec.page ? rec.page + " · " + rec.heading : rec.page;
      return '<li role="option" id="vv-opt-' + i + '"><a class="vv-result" href="' + esc(rec.url) + '">' +
        '<span class="vv-crumb">' + esc(crumb) + '</span>' +
        '<span class="vv-snip">' + highlight(snippet(rec.text, r.toks), r.toks) + '</span></a></li>';
    }).join("");
    renderAsk(q, false);
  }

  function setActive(i) {
    var opts = els.list.querySelectorAll("li");
    if (!opts.length) return;
    activeIdx = (i + opts.length) % opts.length;
    Array.prototype.forEach.call(opts, function (o, k) { o.classList.toggle("is-active", k === activeIdx); o.setAttribute("aria-selected", k === activeIdx); });
    els.input.setAttribute("aria-activedescendant", opts[activeIdx].id);
    opts[activeIdx].scrollIntoView({ block: "nearest" });
  }

  /* ---------- panel ---------- */

  function build() {
    var wrap = document.createElement("div");
    wrap.id = "vv-search";
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="vv-backdrop" data-close></div>' +
      '<div class="vv-panel" role="dialog" aria-modal="true" aria-label="Search Vivander Advisors">' +
        '<div class="vv-field">' +
          '<svg class="vv-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>' +
          '<input id="vv-input" type="search" autocomplete="off" spellcheck="false" placeholder="Ask about AI discovery, training, speaking…" ' +
            'role="combobox" aria-expanded="true" aria-controls="vv-list" aria-autocomplete="list">' +
          '<button type="button" class="vv-close" data-close aria-label="Close search">Esc</button>' +
        '</div>' +
        '<div class="vv-body">' +
          '<div class="vv-label" aria-live="polite"></div>' +
          '<ul id="vv-list" class="vv-list" role="listbox"></ul>' +
        '</div>' +
        '<div class="vv-ask"></div>' +
      '</div>';
    document.body.appendChild(wrap);
    els.wrap = wrap;
    els.input = wrap.querySelector("#vv-input");
    els.list = wrap.querySelector("#vv-list");
    els.label = wrap.querySelector(".vv-label");
    els.ask = wrap.querySelector(".vv-ask");

    var t;
    els.input.addEventListener("input", function () { clearTimeout(t); t = setTimeout(render, 90); });
    els.input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(activeIdx + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(activeIdx - 1); }
      else if (e.key === "Enter") {
        var opts = els.list.querySelectorAll("li");
        var target = opts[activeIdx >= 0 ? activeIdx : 0];
        if (target) { e.preventDefault(); target.querySelector("a,button").click(); }
        else if (norm(els.input.value)) { e.preventDefault(); window.location.href = contactHref(norm(els.input.value)); }
      }
    });
    wrap.addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) { close(); return; }
      var s = e.target.closest(".vv-suggest");
      if (s) { els.input.value = s.getAttribute("data-search"); render(); els.input.focus(); return; }
      if (e.target.closest(".vv-result")) close(true);
    });
    wrap.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      if (e.key === "Tab") trapFocus(e);
    });
  }

  function trapFocus(e) {
    var f = els.wrap.querySelectorAll("input,button,a[href]");
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open(trigger) {
    if (!els.wrap) build();
    lastTrigger = trigger || document.activeElement;
    els.wrap.hidden = false;
    document.documentElement.classList.add("vv-search-open");
    render();
    loadIndex();
    setTimeout(function () { els.input.focus(); els.input.select(); }, 0);
  }

  function close(navigating) {
    if (!els.wrap || els.wrap.hidden) return;
    els.wrap.hidden = true;
    document.documentElement.classList.remove("vv-search-open");
    if (!navigating && lastTrigger && lastTrigger.focus) lastTrigger.focus();
  }

  /* ---------- contact form prefill ---------- */

  function prefillContact() {
    var form = document.querySelector("form[name=contact]");
    if (!form) return;
    var p = new URLSearchParams(window.location.search);
    var q = p.get("q"), topic = p.get("topic"), src = p.get("src");
    if (q) {
      var msg = form.querySelector("[name=message]");
      if (msg && !msg.value) msg.value = q;
    }
    if (topic) {
      var sel = form.querySelector("[name=interest]");
      if (sel) Array.prototype.forEach.call(sel.options, function (o) { if (o.value === topic) sel.value = topic; });
    }
    if (src) {
      var s = form.querySelector("[name=source]");
      if (s) s.value = src;
    }
    if (q) {
      var name = form.querySelector("[name=name]");
      if (name) setTimeout(function () { name.focus({ preventScroll: true }); }, 0);
    }
  }

  /* ---------- init ---------- */

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-search-open]"), function (b) {
      b.addEventListener("click", function () { open(b); });
    });
    document.addEventListener("keydown", function (e) {
      var tag = (e.target.tagName || "").toLowerCase();
      var typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        open();
      }
    });
    prefillContact();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
