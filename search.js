/* ============================================================
   Vivander Advisors: site search
   Adds a Search button to the nav and a search overlay with
   guided questions, free keyword search, and a permanent
   Contact us button. No dependencies.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Content index ----------
     topic: maps to an option on the contact form so the
     "Contact us" button can prefill the inquiry. */
  var INDEX = [
    { id: "discovery", title: "AI Discovery", page: "Services", url: "services.html#discovery", topic: "discovery",
      text: "A visibility audit across ChatGPT, Gemini, Perplexity, and Claude. We diagnose, set strategy, plan implementation, and track your progress. The check on your SEO and digital agency.",
      keywords: "seo geo aeo llm answer engine chatgpt gemini perplexity claude visibility found discoverable audit diagnostic search ranking recommendation agency second opinion" },
    { id: "diagnostic", title: "Request an AI visibility diagnostic", page: "Services", url: "services.html#discovery", topic: "discovery",
      text: "Find out how visible you are to AI today. We run a full diagnostic across the major answer engines and tell you plainly where you stand.",
      keywords: "diagnose audit score benchmark how visible am i chatgpt check report" },
    { id: "training", title: "AI Training", page: "Services", url: "services.html#training", topic: "training",
      text: "Make your team fluent in AI. Executive briefings, the Claude for Executives cohort, Claude Code in a Day, and 1:1 coworking sessions.",
      keywords: "literacy education workshop course cohort learn teach upskill team fluency briefing board claude code coworking" },
    { id: "claude-exec", title: "Claude for Executives", page: "AI Training", url: "services.html#training", topic: "training",
      text: "A 4-week live cohort, capped at 12. Leaders leave with a personal AI workflow and one real project shipped.",
      keywords: "cohort course leaders c-suite claude weekly class" },
    { id: "claude-code", title: "Claude Code in a Day", page: "AI Training", url: "services.html#training", topic: "training",
      text: "A one-day, hands-on team workshop on your real problems. Teams leave with a working agent workflow.",
      keywords: "workshop agent agents developers engineering hands-on automation" },
    { id: "scaling", title: "AI Scaling", page: "Services", url: "services.html#scaling", topic: "scaling",
      text: "Turn promising pilots into real P&L impact. Portfolio review, operating model, ship and instrument one or two workflows, then compound.",
      keywords: "pilot pilots roi p&l profit operating model workflow implementation stalled stuck scale production portfolio cfo" },
    { id: "concierge", title: "Executive Concierge", page: "Services", url: "services.html#concierge", topic: "concierge",
      text: "A private 1:1 AI advisor for senior executives. Weekly briefings, on-call answers by text, and quarterly working sessions.",
      keywords: "private personal advisor coach 1:1 one-on-one ceo executive discreet ghostwriter concierge" },
    { id: "platform", title: "Don't Be Invisible (platform)", page: "Platform", url: "dont-be-invisible.html", topic: "discovery",
      text: "See how AI sees you. Visibility tracking, competitor monitoring, an action engine, and a written executive brief.",
      keywords: "software tool dashboard tracking monitor competitors share of recommendation product platform" },
    { id: "platform-access", title: "Request platform access", page: "Platform", url: "dont-be-invisible.html#access", topic: "discovery",
      text: "We are onboarding design partners now. Plans run from a single brand to multi-brand and enterprise.",
      keywords: "pricing plans access trial demo design partner enterprise" },
    { id: "founder", title: "Michael J. Goldrich, founder", page: "Leadership", url: "about.html", topic: "other",
      text: "Former Chief Experience Officer at The Hotels Network. Senior roles at Starwood, Wyndham, Club Quarters, Accenture, and Monster. Author of three books. HSMAI Top 25 Most Extraordinary Minds in Hospitality.",
      keywords: "michael goldrich founder leader leadership team who bio biography background experience ceo partner" },
    { id: "about", title: "Why Vivander exists and how we work", page: "Leadership", url: "about.html", topic: "other",
      text: "Small, senior, partner-led. Every engagement is run by someone with operating experience. We scope against outcomes and tell clients when they don't need us.",
      keywords: "about firm company team approach values philosophy partner-led operator" },
    { id: "industries", title: "Industries we serve", page: "Leadership", url: "about.html", topic: "other",
      text: "Hospitality and travel are our home category: hotels, resorts, and multi-property groups. We also work in professional services, specialty retail, and multi-site businesses.",
      keywords: "hospitality hotel hotels travel resorts retail professional services industry industries sector" },
    { id: "speaking", title: "Speaking and keynotes", page: "Leadership", url: "speaking.html", topic: "speaking",
      text: "The George Jetson Moment Is Here, plus talks on AI discovery, the C-suite literacy gap, board AI theses, and pilot to profit. Booking Q3 and Q4 2026.",
      keywords: "keynote speaker speech talk conference event panel fireside board session book michael" },
    { id: "jetson", title: "The George Jetson Moment Is Here", page: "Speaking", url: "speaking.html#signature", topic: "speaking",
      text: "The signature 2026 keynote on the human in the loop. Why push-button work creates more responsibility for leaders.",
      keywords: "jetson human in the loop accountability future of work keynote" },
    { id: "books", title: "Books", page: "Leadership", url: "books.html", topic: "books",
      text: "Three books on AI and modern leadership: Invisible, The AI Literacy Playbook, and Too Many Hats, Too Little Time.",
      keywords: "book books author read reading bulk order publication" },
    { id: "invisible", title: "Invisible: What to Do When AI Erases Your Business", page: "Books", url: "books.html#invisible", topic: "books",
      text: "How answer engines are rewriting customer discovery, and the playbook for companies that refuse to disappear.",
      keywords: "invisible book discovery answer engines erase" },
    { id: "literacy-book", title: "The AI Literacy Playbook", page: "Books", url: "books.html#literacy", topic: "books",
      text: "A practical guide to building AI fluency across a leadership team.",
      keywords: "literacy playbook book fluency leadership" },
    { id: "hats", title: "Too Many Hats, Too Little Time", page: "Books", url: "books.html#hats", topic: "books",
      text: "A book on modern leadership for executives stretched across too many roles.",
      keywords: "hats leadership time management book" },
    { id: "insights", title: "Insights and essays", page: "Insights", url: "insights.html", topic: "other",
      text: "Essays, research, and columns from inside the work, including Michael's column for Hospitality Upgrade and the monthly Vivander letter.",
      keywords: "blog articles essays newsletter letter column research thinking writing hospitality upgrade" },
    { id: "share-rec", title: "Share of recommendation is the new share of search", page: "Insights", url: "insights.html", topic: "discovery",
      text: "Why the metric that matters is how often AI recommends you, and how to measure it.",
      keywords: "share of recommendation share of search metric measure" },
    { id: "pilot-roi", title: "Why most AI pilots die at the \"who owns this?\" meeting", page: "Insights", url: "insights.html", topic: "scaling",
      text: "Ownership, not technology, is where most AI pilots fail. What to do about it.",
      keywords: "pilot ownership roi fail" },
    { id: "contact", title: "Contact us", page: "Contact", url: "contact.html", topic: "other",
      text: "Send a message or book a 30-minute call. Most replies go out within one business day.",
      keywords: "contact email call book meeting talk reach phone message hello inquiry price pricing cost quote" }
  ];

  /* ---------- Guided questions ---------- */
  var GUIDES = [
    { label: "Our services", items: [
      { q: "How do I show up in ChatGPT and AI answers?", ids: ["discovery", "diagnostic", "platform"], topic: "discovery" },
      { q: "Can you train my team to use AI?", ids: ["training", "claude-exec", "claude-code"], topic: "training" },
      { q: "Our AI pilots stall. Can you help?", ids: ["scaling", "pilot-roi"], topic: "scaling" },
      { q: "I want a private AI advisor.", ids: ["concierge"], topic: "concierge" }
    ]},
    { label: "Our leadership", items: [
      { q: "Who leads Vivander?", ids: ["founder", "about", "industries"], topic: "other" },
      { q: "Can Michael speak at our event?", ids: ["speaking", "jetson"], topic: "speaking" },
      { q: "What has Vivander written?", ids: ["books", "invisible", "insights"], topic: "books" }
    ]}
  ];

  var byId = {};
  INDEX.forEach(function (d) {
    byId[d.id] = d;
    d._title = norm(d.title);
    d._kw = norm(d.keywords + " " + d.page);
    d._text = norm(d.text);
  });

  function norm(s) {
    return (" " + String(s).toLowerCase().replace(/[^a-z0-9&]+/g, " ") + " ");
  }
  function tokens(q) {
    return norm(q).trim().split(/\s+/).filter(function (t) { return t && STOP.indexOf(t) < 0; });
  }
  var STOP = ["a","an","the","and","or","of","to","for","in","on","is","are","do","does","i","we","my","our","you","your","can","how","what","with","me","about","it"];

  function score(doc, toks) {
    var total = 0, hits = 0;
    toks.forEach(function (t) {
      var stem = t.length > 3 ? t.replace(/(ing|es|s)$/, "") : t;
      var s = 0;
      if (doc._title.indexOf(" " + stem) >= 0) s += 6;
      if (doc._kw.indexOf(" " + stem) >= 0) s += 4;
      if (doc._text.indexOf(" " + stem) >= 0) s += 2;
      else if (stem.length > 3 && doc._text.indexOf(stem) >= 0) s += 1;
      if (s) hits++;
      total += s;
    });
    // Reward documents that match every term.
    return hits === toks.length ? total * 1.5 : total;
  }

  function search(q) {
    var toks = tokens(q);
    if (!toks.length) return [];
    return INDEX.map(function (d) { return { d: d, s: score(d, toks) }; })
      .filter(function (r) { return r.s > 0; })
      .sort(function (a, b) { return b.s - a.s; })
      .slice(0, 8)
      .map(function (r) { return r.d; });
  }

  /* ---------- DOM ---------- */
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';

  var overlay, input, body, cta, lastFocus, activeIdx = -1, currentTopic = "other";

  function build() {
    // Nav trigger, placed beside the Book a call button.
    var navCta = document.querySelector("nav.top .nav-cta");
    if (navCta) {
      var wrap = el("div", { "class": "nav-actions" });
      navCta.parentNode.insertBefore(wrap, navCta);
      var btn = el("button", { type: "button", "class": "nav-search", "aria-label": "Search the site", "aria-haspopup": "dialog" },
        ICON + '<span class="nav-search-label">Search</span>');
      btn.addEventListener("click", open);
      wrap.appendChild(btn);
      wrap.appendChild(navCta);
    }

    overlay = el("div", { "class": "search-overlay", role: "dialog", "aria-modal": "true", "aria-label": "Search Vivander Advisors", hidden: "" });
    overlay.innerHTML =
      '<div class="search-panel">' +
        '<div class="search-bar">' + ICON +
          '<input type="search" class="search-input" placeholder="Search or ask a question" autocomplete="off" aria-label="Search" aria-controls="search-body">' +
          '<button type="button" class="search-close" aria-label="Close search">Esc</button>' +
        '</div>' +
        '<div class="search-body" id="search-body" aria-live="polite"></div>' +
        '<div class="search-foot">' +
          '<span class="search-foot-text">Can\'t find what you need? We reply within one business day.</span>' +
          '<a class="btn btn-primary search-contact" href="contact.html">Contact us &rarr;</a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    input = overlay.querySelector(".search-input");
    body = overlay.querySelector(".search-body");
    cta = overlay.querySelector(".search-contact");

    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    overlay.querySelector(".search-close").addEventListener("click", close);
    input.addEventListener("input", function () { render(input.value); });
    overlay.addEventListener("keydown", onKey);

    document.addEventListener("keydown", function (e) {
      if (!overlay.hidden) return;
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        open();
      }
    });
  }

  function open() {
    lastFocus = document.activeElement;
    overlay.hidden = false;
    document.documentElement.classList.add("search-open");
    input.value = "";
    render("");
    input.focus();
  }
  function close() {
    overlay.hidden = true;
    document.documentElement.classList.remove("search-open");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function setContact(topic, q) {
    currentTopic = topic || "other";
    var params = "?topic=" + encodeURIComponent(currentTopic);
    if (q) params += "&q=" + encodeURIComponent(q);
    cta.setAttribute("href", "contact.html" + params);
  }

  function resultsHTML(list) {
    return '<ul class="search-results" role="listbox">' + list.map(function (d, i) {
      return '<li role="option" id="sr-' + i + '"><a class="search-result" href="' + esc(d.url) + '">' +
        '<span class="sr-page">' + esc(d.page) + '</span>' +
        '<span class="sr-title">' + esc(d.title) + '</span>' +
        '<span class="sr-text">' + esc(d.text) + '</span></a></li>';
    }).join("") + '</ul>';
  }

  function render(q) {
    activeIdx = -1;
    q = q.trim();
    if (!q) {
      setContact("other");
      body.innerHTML = '<div class="eyebrow search-prompt">What brings you here?</div><div class="search-guides">' +
        GUIDES.map(function (g, gi) {
          return '<div class="search-guide"><div class="search-guide-label">' + esc(g.label) + '</div><ul>' +
            g.items.map(function (it, ii) {
              return '<li><button type="button" class="search-q" data-g="' + gi + '" data-i="' + ii + '">' + esc(it.q) + '<span aria-hidden="true">&rarr;</span></button></li>';
            }).join("") + '</ul></div>';
        }).join("") + '</div>';
      Array.prototype.forEach.call(body.querySelectorAll(".search-q"), function (b) {
        b.addEventListener("click", function () {
          renderGuide(GUIDES[b.getAttribute("data-g")].items[b.getAttribute("data-i")]);
        });
      });
      return;
    }

    var list = search(q);
    setContact(list.length ? list[0].topic : "other", q);
    if (!list.length) {
      body.innerHTML = '<div class="search-empty"><p class="search-empty-title">Nothing on the site matches &ldquo;' + esc(q) + '&rdquo;.</p>' +
        '<p>That question may be one we answer best in person. Send it to us and a partner will reply.</p></div>';
      return;
    }
    body.innerHTML = resultsHTML(list);
  }

  function renderGuide(item) {
    activeIdx = -1;
    setContact(item.topic, item.q);
    var list = item.ids.map(function (id) { return byId[id]; });
    body.innerHTML = '<button type="button" class="search-back">&larr; All questions</button>' +
      '<div class="search-asked">' + esc(item.q) + '</div>' + resultsHTML(list);
    body.querySelector(".search-back").addEventListener("click", function () { render(""); input.focus(); });
  }

  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "Tab") { trapFocus(e); return; }
    var links = body.querySelectorAll(".search-result");
    if (!links.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = e.key === "ArrowDown" ? Math.min(activeIdx + 1, links.length - 1) : Math.max(activeIdx - 1, 0);
      links[activeIdx].focus();
    } else if (e.key === "Enter" && document.activeElement === input) {
      e.preventDefault();
      links[0].click();
    }
  }

  function trapFocus(e) {
    var f = overlay.querySelectorAll("input, button, a[href]");
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------- Contact form prefill ----------
     contact.html?topic=training&q=... selects the matching
     "Interested in" option and seeds the message box. */
  function prefillContact() {
    var sel = document.getElementById("contact-interest");
    var msg = document.getElementById("contact-message");
    if (!sel) return;
    var p = new URLSearchParams(location.search);
    var topic = p.get("topic"), q = p.get("q");
    if (topic) {
      var opt = sel.querySelector('option[data-topic="' + topic.replace(/[^a-z]/g, "") + '"]');
      if (opt) sel.value = opt.value;
    }
    if (q && msg && !msg.value) msg.value = q.slice(0, 300);
  }

  function init() { build(); prefillContact(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
