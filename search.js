/* Vivander site search.
   Adds a Search button to the nav and a search panel that covers every page.
   The panel always carries a "Questions? Contact us" button that hands the
   visitor (and whatever they typed) to the contact form.
   Index: search-index.json, built by scripts/build-search-index.mjs. */
(function () {
  "use strict";

  var INDEX_URL = "search-index.json";
  var CONTACT_URL = "contact.html";
  var MAX_RESULTS = 8;

  var index = null;      // flat list of searchable records
  var loading = null;    // in-flight fetch promise
  var active = -1;       // keyboard-highlighted result
  var lastFocus = null;

  // ---------- DOM ----------
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (html != null) n.innerHTML = html;
    return n;
  }

  var ICON = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><circle cx="8.5" cy="8.5" r="5.75" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M13 13l4.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

  var trigger = el("button", { type: "button", class: "search-trigger", "aria-label": "Search the site", "aria-haspopup": "dialog" },
    ICON + '<span class="search-trigger-label">Search</span><kbd class="search-kbd">/</kbd>');

  var overlay = el("div", { class: "search-overlay", hidden: "" });
  overlay.innerHTML =
    '<div class="search-panel" role="dialog" aria-modal="true" aria-labelledby="search-title">' +
      '<h2 id="search-title" class="search-sr">Search Vivander Advisors</h2>' +
      '<div class="search-bar">' + ICON +
        '<input class="search-input" type="search" autocomplete="off" spellcheck="false" placeholder="Search services, books, speaking, insights" ' +
          'role="combobox" aria-expanded="false" aria-controls="search-results" aria-autocomplete="list">' +
        '<button type="button" class="search-close" aria-label="Close search">Esc</button>' +
      '</div>' +
      '<div class="search-body">' +
        '<ul id="search-results" class="search-results" role="listbox" aria-label="Search results"></ul>' +
        '<div class="search-empty" hidden></div>' +
        '<div class="search-hint">' +
          '<div class="eyebrow">Popular</div>' +
          '<div class="search-chips"></div>' +
        '</div>' +
      '</div>' +
      '<div class="search-foot">' +
        '<span class="search-foot-text">Can’t find what you need? Ask us directly.</span>' +
        '<a class="btn btn-primary search-contact" href="' + CONTACT_URL + '">Questions? Contact us →</a>' +
      '</div>' +
      '<div class="search-status search-sr" aria-live="polite"></div>' +
    '</div>';

  var panel = overlay.querySelector(".search-panel");
  var input = overlay.querySelector(".search-input");
  var list = overlay.querySelector(".search-results");
  var empty = overlay.querySelector(".search-empty");
  var hint = overlay.querySelector(".search-hint");
  var chips = overlay.querySelector(".search-chips");
  var contact = overlay.querySelector(".search-contact");
  var status = overlay.querySelector(".search-status");

  ["AI Discovery", "Training", "Keynote", "Invisible", "Concierge", "Workshop"].forEach(function (q) {
    var b = el("button", { type: "button", class: "search-chip" }, escapeHtml(q));
    b.addEventListener("click", function () { input.value = q; run(); input.focus(); });
    chips.appendChild(b);
  });

  // ---------- Index ----------
  function load() {
    if (index) return Promise.resolve(index);
    if (loading) return loading;
    loading = fetch(INDEX_URL, { credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        index = [];
        data.pages.forEach(function (p) {
          // One record for the page itself, then one per section.
          index.push(record(p, "", "", p.description, true));
          p.sections.forEach(function (s) { index.push(record(p, s.heading, s.anchor, s.text, false, s.kicker)); });
        });
        return index;
      })
      .catch(function (e) { loading = null; throw e; });
    return loading;
  }

  function record(page, heading, anchor, text, isPage, kicker) {
    var label = page.label || page.title;
    // Show a section's own label as context when it is short enough to scan.
    if (kicker && kicker.length <= 32) label += " \u00b7 " + kicker;
    return {
      page: label,
      url: page.url,
      heading: heading || page.title,
      anchor: anchor,
      text: text || "",
      isPage: isPage,
      h: norm(heading || page.title),
      k: norm(kicker || ""),
      p: norm(page.label + " " + page.title),
      t: norm(text || "")
    };
  }

  // ---------- Matching ----------
  function norm(s) {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[‘’']/g, "").replace(/[^a-z0-9&:]+/g, " ").trim();
  }

  function terms(q) {
    return norm(q).split(" ").filter(function (t) { return t.length > 0; });
  }

  function hasWord(hay, t) {
    // word-prefix match: "train" finds "training", not "restrain"
    return (" " + hay).indexOf(" " + t) !== -1;
  }

  function score(r, ts, phrase) {
    var s = 0;
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i], hit = false;
      if (hasWord(r.h, t)) { s += 10; hit = true; }
      if (hasWord(r.k, t)) { s += 10; hit = true; }
      if (hasWord(r.p, t)) { s += 4; hit = true; }
      if (hasWord(r.t, t)) { s += 2; hit = true; }
      if (!hit) return 0; // every term must appear somewhere
    }
    if (ts.length > 1 && (r.h.indexOf(phrase) !== -1 || r.k.indexOf(phrase) !== -1)) s += 15;
    else if (ts.length > 1 && r.t.indexOf(phrase) !== -1) s += 6;
    if (r.isPage || r.anchor) s += 1; // prefer results that land somewhere specific
    return s;
  }

  function search(q) {
    var ts = terms(q);
    if (!ts.length) return [];
    var phrase = ts.join(" ");
    var hits = [];
    index.forEach(function (r) { var s = score(r, ts, phrase); if (s) hits.push({ r: r, s: s }); });
    hits.sort(function (a, b) { return b.s - a.s; });
    // Cap results per page so one long page can't crowd out the rest.
    var perPage = {}, out = [];
    for (var i = 0; i < hits.length && out.length < MAX_RESULTS; i++) {
      var u = hits[i].r.url;
      perPage[u] = (perPage[u] || 0) + 1;
      if (perPage[u] <= 3) out.push(hits[i].r);
    }
    return out;
  }

  // ---------- Rendering ----------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // One pass over the raw text, escaping as we go, so a term can never
  // match inside markup we inserted.
  function highlight(s, ts) {
    if (!ts.length) return escapeHtml(s);
    var alt = ts.slice().sort(function (a, b) { return b.length - a.length; })
      .map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|");
    var re = new RegExp("(^|[^a-z0-9])(" + alt + ")", "gi");
    var out = "", last = 0, m;
    while ((m = re.exec(s))) {
      var start = m.index + m[1].length;
      out += escapeHtml(s.slice(last, start)) + "<mark>" + escapeHtml(m[2]) + "</mark>";
      last = start + m[2].length;
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    return out + escapeHtml(s.slice(last));
  }

  function snippet(text, ts) {
    if (!text) return "";
    var low = text.toLowerCase(), at = -1;
    for (var i = 0; i < ts.length && at === -1; i++) at = low.indexOf(ts[i]);
    var start = Math.max(0, at - 60);
    if (start > 0) { var sp = text.indexOf(" ", start); if (sp !== -1 && sp < at) start = sp + 1; }
    var s = text.slice(start, start + 170);
    if (start + 170 < text.length) s = s.replace(/\s+\S*$/, "") + "…";
    return (start > 0 ? "…" : "") + s;
  }

  function href(r) {
    if (r.anchor) return r.url + "#" + r.anchor;
    if (r.isPage) return r.url;
    // No section id: use a text fragment so supporting browsers scroll to the heading.
    var frag = encodeURIComponent(r.heading).replace(/-/g, "%2D");
    return r.url + "#:~:text=" + frag;
  }

  function setContactLink(q) {
    contact.href = q ? CONTACT_URL + "?q=" + encodeURIComponent(q) + "#message" : CONTACT_URL + "#message";
  }

  function render(q, results) {
    var ts = terms(q);
    list.innerHTML = "";
    active = -1;
    input.removeAttribute("aria-activedescendant");
    hint.hidden = !!q.trim();
    empty.hidden = true;
    panel.classList.remove("is-empty");

    if (!q.trim()) { input.setAttribute("aria-expanded", "false"); status.textContent = ""; return; }

    if (!results.length) {
      empty.hidden = false;
      empty.innerHTML = '<p class="search-empty-title">No matches for “' + escapeHtml(q.trim()) + '”.</p>' +
        '<p class="search-empty-text">Send us the question instead. We’ll pass along what you typed so you don’t have to repeat it.</p>';
      panel.classList.add("is-empty");
      input.setAttribute("aria-expanded", "false");
      status.textContent = "No results. Contact us button available.";
      return;
    }

    results.forEach(function (r, i) {
      var li = el("li", { role: "option", id: "search-opt-" + i, "aria-selected": "false" });
      li.innerHTML =
        '<a class="search-result" href="' + escapeHtml(href(r)) + '" tabindex="-1">' +
          '<span class="search-result-page">' + escapeHtml(r.page) + '</span>' +
          '<span class="search-result-title">' + highlight(r.heading, ts) + '</span>' +
          (r.text ? '<span class="search-result-text">' + highlight(snippet(r.text, ts), ts) + '</span>' : '') +
        '</a>';
      li.addEventListener("mousemove", function () { if (active !== i) setActive(i); });
      list.appendChild(li);
    });
    input.setAttribute("aria-expanded", "true");
    status.textContent = results.length + (results.length === 1 ? " result" : " results");
  }

  function setActive(i) {
    var items = list.children;
    if (!items.length) return;
    if (active > -1 && items[active]) items[active].setAttribute("aria-selected", "false");
    active = (i + items.length) % items.length;
    items[active].setAttribute("aria-selected", "true");
    input.setAttribute("aria-activedescendant", items[active].id);
    items[active].scrollIntoView({ block: "nearest" });
  }

  var timer;
  function run() {
    var q = input.value;
    setContactLink(q.trim());
    clearTimeout(timer);
    timer = setTimeout(function () {
      load().then(function () { render(q, search(q)); }, function () {
        hint.hidden = true;
        empty.hidden = false;
        empty.innerHTML = '<p class="search-empty-title">Search is unavailable right now.</p><p class="search-empty-text">Contact us and we’ll point you to the right place.</p>';
        panel.classList.add("is-empty");
      });
    }, 60);
  }

  // ---------- Open / close ----------
  function open(prefill) {
    if (!overlay.hidden) return;
    lastFocus = document.activeElement;
    overlay.hidden = false;
    document.documentElement.classList.add("search-open");
    if (typeof prefill === "string") input.value = prefill;
    run();
    load().catch(function () {});
    setTimeout(function () { input.focus(); input.select(); }, 0);
  }

  function close() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    document.documentElement.classList.remove("search-open");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  trigger.addEventListener("click", function () { open(); });
  overlay.querySelector(".search-close").addEventListener("click", close);
  overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) close(); });
  input.addEventListener("input", run);

  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
    else if (e.key === "Enter") {
      var target = list.children[active > -1 ? active : 0];
      if (target) { e.preventDefault(); window.location.href = target.querySelector("a").href; }
      else if (input.value.trim()) { e.preventDefault(); window.location.href = contact.href; }
    }
  });

  // Keep Tab inside the dialog.
  panel.addEventListener("keydown", function (e) {
    if (e.key !== "Tab") return;
    var f = panel.querySelectorAll("input, button:not([hidden]), a[href]:not([tabindex='-1'])");
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !overlay.hidden) { e.preventDefault(); close(); return; }
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey)) {
      e.preventDefault();
      overlay.hidden ? open() : close();
    }
  });

  // Close the panel when a result points at the page we're already on.
  list.addEventListener("click", function (e) {
    var a = e.target.closest("a");
    if (a && a.pathname === location.pathname) close();
  });

  // ---------- Mount ----------
  function mount() {
    var navRow = document.querySelector("nav.top .row");
    if (!navRow) return;
    var cta = navRow.querySelector(".nav-cta");
    var wrap = el("div", { class: "nav-actions" });
    navRow.insertBefore(wrap, cta || null);
    wrap.appendChild(trigger);
    if (cta) wrap.appendChild(cta);
    document.body.appendChild(overlay);
    var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    trigger.title = "Search (/ or " + (mac ? "⌘" : "Ctrl") + "K)";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
