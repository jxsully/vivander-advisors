// Builds search-index.json from every top-level .html page on the site.
// Run: node scripts/build-search-index.mjs
// Netlify runs this on every deploy (see netlify.toml), so the index
// never drifts from the pages. No dependencies.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "search-index.json");

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…", middot: "·", copy: "©" };

function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

function text(html) {
  return decode(html.replace(/<[^>]+>/g, " "))
    .replace(/[\u2190-\u21ff]/g, " ") // decorative arrows on links and buttons
    .replace(/\s+/g, " ")
    .trim();
}

function stripChrome(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|nav|footer|head|svg)\b[\s\S]*?<\/\1>/gi, "")
    // form controls carry no readable content
    .replace(/<(select|textarea|button|label)\b[\s\S]*?<\/\1>/gi, " ");
}

function indexPage(file) {
  const raw = readFileSync(join(ROOT, file), "utf8");
  const pageTitle = text((raw.match(/<title>([\s\S]*?)<\/title>/i) || [, file])[1])
    .replace(/\s+[—|-]\s+Vivander Advisors$/, "");
  const description = decode((raw.match(/<meta\s+name="description"\s+content="([^"]*)"/i) || [, ""])[1]);
  const label = (raw.match(/data-screen-label="([^"]*)"/) || [, pageTitle])[1];

  const body = stripChrome(raw);
  // Walk headings in document order. Each heading owns the text up to the next one.
  const headingRe = /<(h[1-4])\b[^>]*>([\s\S]*?)<\/\1>/gi;
  // Each <section> starts a new scope. Its id (if any) is the deep link
  // for every heading inside it, and stops applying at the next <section>.
  const scopes = [...body.matchAll(/<section\b([^>]*)>/gi)].map((m) => ({
    pos: m.index,
    id: (m[1].match(/\bid="([^"]+)"/) || [, ""])[1],
  }));
  const heads = [...body.matchAll(headingRe)].map((m) => ({ pos: m.index, end: m.index + m[0].length, tag: m[1].toLowerCase(), text: text(m[2]) }));

  const sections = [];
  heads.forEach((h, i) => {
    const prevEnd = i ? heads[i - 1].end : 0;
    // A heading's text runs to the next heading or the next <section>,
    // whichever comes first, so it never swallows the next section's label.
    const nextScope = scopes.find((sc) => sc.pos > h.end);
    const end = Math.min(heads[i + 1] ? heads[i + 1].pos : body.length, nextScope ? nextScope.pos : body.length);
    const content = text(body.slice(h.end, end));

    let anchor = "", scopeStart = -1;
    for (const sc of scopes) if (sc.pos <= h.pos) { anchor = sc.id; scopeStart = sc.pos; }

    // Short label that opens a section ahead of its heading, such as
    // "02 AI Training". It names the section, so it should find it.
    let kicker = "";
    if (scopeStart >= prevEnd) {
      const lead = text(body.slice(scopeStart, h.pos)).replace(/^\d+\s+/, "");
      if (lead && lead.length <= 60) kicker = lead;
    }

    if (!h.text && !content) return;
    // The same heading can appear twice on a page (e.g. a featured list and
    // an archive list). Keep one hit, with the richer text.
    const dupe = sections.find((x) => x.heading === h.text);
    if (dupe) {
      if (content.length > dupe.text.length) dupe.text = content.slice(0, 1200);
      return;
    }
    const sec = { heading: h.text, anchor: h.tag === "h1" ? "" : anchor, text: content.slice(0, 1200) };
    if (kicker) sec.kicker = kicker;
    sections.push(sec);
  });

  return { url: file === "index.html" ? "index.html" : file, title: pageTitle, label, description, sections };
}

const pages = readdirSync(ROOT)
  .filter((f) => f.endsWith(".html"))
  .sort((a, b) => (a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b)))
  .map(indexPage);

writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), pages }));
const n = pages.reduce((s, p) => s + p.sections.length, 0);
console.log(`search-index.json: ${pages.length} pages, ${n} sections`);
