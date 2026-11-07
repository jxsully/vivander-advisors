#!/usr/bin/env python3
"""Carry the live WordPress site's search equity into the static redesign.

What it does, in order:
  1. Pulls every post and page from the live WordPress REST API.
  2. Writes each post, and each content-rich page, as a static page at the
     exact same URL (/slug/index.html), keeping Yoast's title, description,
     canonical, Open Graph tags and schema graph.
  3. Downloads every /wp-content/uploads/ file those pages reference, at the
     same path, so image URLs keep working after WordPress is switched off.
  4. Writes _redirects (301s for every retired URL), sitemap.xml, robots.txt,
     llms.txt, feed.xml and 404.html.
  5. Adds canonical, Open Graph and JSON-LD to the hand-built pages, and an
     archive of every migrated article to insights.html.

Run it from the repo root while the WordPress site is still live:

    python3 scripts/migrate_wordpress.py [--cache DIR] [--skip-images]

It is safe to re-run. Generated blocks in the hand-built pages sit between
<!-- generated:... --> markers and are replaced on each run.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import html
import json
import os
import re
import shutil
import sys
import urllib.parse
import urllib.request
from pathlib import Path

SITE = "https://vivanderadvisors.com"
ROOT = Path(__file__).resolve().parent.parent
TODAY = dt.date.today().isoformat()
UA = "vivander-static-migration/1.0"

ORG_ID = f"{SITE}/#organization"
WEBSITE_ID = f"{SITE}/#website"
# Same @id Yoast uses on the live site, so the entity graph stays continuous.
PERSON_ID = f"{SITE}/#/schema/person/ab889df45b5d0eeb2de2b3e8b2afef60"
LOGO_URL = f"{SITE}/wp-content/uploads/2026/10/vivander-logo-transparent.png"
PORTRAIT_URL = f"{SITE}/wp-content/uploads/2024/01/Michael-Goldrich-b-08.jpg"

# ---------------------------------------------------------------------------
# URL decisions
# ---------------------------------------------------------------------------

# WordPress pages with substantial, unique content and no equivalent in the
# redesign. These keep their URL and are republished as static pages.
MIGRATE_PAGES = [
    "web3-web4-agentic-hospitality",
    "invisible-discovery-crisis-hotel-ai-visibility",
    "george-jetson-moment-ai-agents-hospitality",
    "everybody-got-promoted-ai-supervision-hotels",
    "signal-optimization",
    "agentic-payments-hotels-restaurants",
    "hotel-restaurant-ai-agent-readiness",
    "ai-agents-hotel-restaurant-discovery",
    "how-personal-ai-agents-find-your-business",
    "ai-visibility-business-cases",
    "ai-visibility-business-case-hospitality",
    "ai-visibility-business-case-restaurants",
    "ai-visibility-business-case-luxury-retail",
    "resources",
    "resources/personal-ai-agent-delegation-and-trust",
    "resources/working-with-personal-ai-agents",
    "ai-agents",
    "how-to-improve-ai-search-visibility",
    "how-to-monitor-ai-search-visibility",
    "how-to-roll-out-ai-in-your-company",
    "how-to-measure-ai-fluency",
    "vivander-faq",
    "generative-ai-prompts",
    "generative-ai-research",
    "ai-personas-and-gpts",
    "revgen_2024_budget_personas",
    "historical-hotel-special-offers-database",
    "is-it-live-or-memorex-or-ai-generated",
    "tasks-to-automate-with-ai",
    "henry-goldrich-smart-automator",
    "privacy-policy",
]

# WordPress pages whose job the redesign already does. Each gets a 301 to the
# closest new page. Netlify treats "#" as a comment, so no fragments here.
PAGE_REDIRECTS = {
    "/about-us/": "/about.html",
    "/about-us/reviews-and-awards/": "/about.html",
    "/contact-us/": "/contact.html",
    "/products/": "/services.html",
    "/products/vivander-audit/": "/services.html",
    "/products/visibility-monitoring/": "/dont-be-invisible.html",
    "/products/agent-builder-sessions/": "/services.html",
    "/products/myteam/": "/services.html",
    "/competitor-website-tracker/": "/dont-be-invisible.html",
    "/ai-visibility/": "/dont-be-invisible.html",
    "/ai-assessment/": "/services.html",
    "/ai-consulting/": "/services.html",
    "/fractional-ai-digital-marketing/": "/services.html",
    "/grow-direct-bookings/": "/services.html",
    "/training/": "/services.html",
    "/ai-literacy-upskilling/": "/services.html",
    "/ai-literacy-upskill-align-lead/": "/services.html",
    "/ai-literacy-discovery-and-scaling/": "/services.html",
    "/become-an-expert-in-an-hour/": "/services.html",
    "/ai-scaling-from-pilot-to-profit/": "/services.html",
    "/revgenai-ops/": "/services.html",
    "/ai-automation/": "/services.html",
    "/ai-chatbots/": "/services.html",
    "/ai-launchpad-packages/": "/services.html",
    "/keynotes/": "/speaking.html",
    "/speaker-spotlight/": "/speaking.html",
    "/invisible/": "/books.html",
    "/too-many-hats-too-little-time/": "/books.html",
    "/ai-literacy-playbook-for-hoteliers/": "/books.html",
    "/writing/": "/insights.html",
    "/recent-articles/": "/insights.html",
    "/ai-personas/": "/ai-personas-and-gpts/",
    # Redirects WordPress already performs, found through links in the content.
    "/personal-ai-agent-delegation-and-trust/": "/resources/personal-ai-agent-delegation-and-trust/",
    "/working-with-personal-ai-agents/": "/resources/working-with-personal-ai-agents/",
    # Linked from articles but already a 404 on the live site.
    "/ai-visibility-audit/": "/services.html",
}

# Redirects that were already in _redirects before this script existed.
LEGACY_REDIRECTS = {
    "/about/": "/about.html",
    "/services/": "/services.html",
    "/speaking/": "/speaking.html",
    "/books/": "/books.html",
    "/insights/": "/insights.html",
    "/contact/": "/contact.html",
}

WILDCARD_REDIRECTS = [
    ("/category/*", "/insights.html"),
    ("/tag/*", "/insights.html"),
    ("/author/*", "/about.html"),
    ("/page/*", "/insights.html"),
    ("/feed/", "/feed.xml"),
    ("/comments/feed/", "/feed.xml"),
    ("/sitemap_index.xml", "/sitemap.xml"),
    ("/wp-sitemap.xml", "/sitemap.xml"),
    ("/post-sitemap.xml", "/sitemap.xml"),
    ("/page-sitemap.xml", "/sitemap.xml"),
    ("/category-sitemap.xml", "/sitemap.xml"),
    ("/post_tag-sitemap.xml", "/sitemap.xml"),
]

# Hand-built pages of the redesign: path, sitemap priority, schema kind.
CORE_PAGES = [
    ("index.html", "/", "1.0", "home"),
    ("services.html", "/services.html", "0.9", "services"),
    ("dont-be-invisible.html", "/dont-be-invisible.html", "0.9", "product"),
    ("books.html", "/books.html", "0.8", "books"),
    ("speaking.html", "/speaking.html", "0.8", "speaking"),
    ("insights.html", "/insights.html", "0.8", "insights"),
    ("about.html", "/about.html", "0.8", "about"),
    ("contact.html", "/contact.html", "0.6", "contact"),
]

# ---------------------------------------------------------------------------
# Fetching
# ---------------------------------------------------------------------------


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def fetch_collection(kind: str, cache: Path) -> list[dict]:
    path = cache / f"{kind}.json"
    if path.exists():
        return json.loads(path.read_text())
    fields = "id,slug,link,date_gmt,modified_gmt,title,excerpt,content,parent,yoast_head_json"
    items, page = [], 1
    while True:
        url = f"{SITE}/wp-json/wp/v2/{kind}?per_page=100&page={page}&_fields={fields}"
        try:
            batch = json.loads(fetch(url))
        except urllib.error.HTTPError as e:
            if e.code == 400:  # past the last page
                break
            raise
        if not batch:
            break
        items.extend(batch)
        page += 1
    path.write_text(json.dumps(items))
    return items


# ---------------------------------------------------------------------------
# Content cleaning
# ---------------------------------------------------------------------------

UPLOAD_RE = re.compile(r"(?:https?:)?//vivanderadvisors\.com(/wp-content/uploads/[^\"'\s)<>,]+)")
DIVI_RE = re.compile(r"\[/?et_pb_[^\]]*\]")


def clean_content(raw: str) -> str:
    c = DIVI_RE.sub("", raw)
    # Divi shortcodes were wrapped in <p> by wpautop; drop the shells left behind.
    c = re.sub(r"<p>\s*(?:<br\s*/?>\s*)*</p>", "", c)
    c = re.sub(r"<p>\s*(?=<(?:style|script|div|section|header|main|article|h[1-6])\b)", "", c)
    c = re.sub(r"(</(?:style|script|div|section|header|main|article|h[1-6])>)\s*</p>", r"\1", c)
    # Responsive variants would each need downloading; the src alone is enough.
    c = re.sub(r'\s(?:srcset|sizes|data-srcset)="[^"]*"', "", c)
    # WordPress-only scripts (emoji, jQuery plugins) have nothing to run against.
    c = re.sub(r"<script[^>]*src=[\"'][^\"']*wp-(?:includes|content/plugins)[^>]*>\s*</script>", "", c)
    return localise(c).strip()


def localise(text: str) -> str:
    """Make links to this site root-relative so they work on any host."""
    text = UPLOAD_RE.sub(r"\1", text)
    text = re.sub(r"https?://(?:www\.)?vivanderadvisors\.com(?=/)", "", text)
    return text


def collect_uploads(*texts: str) -> set[str]:
    found: set[str] = set()
    for t in texts:
        found |= {m.split("?")[0] for m in UPLOAD_RE.findall(t)}
        found |= {m.split("?")[0] for m in re.findall(r"(?<![\w.])(/wp-content/uploads/[^\"'\s)<>,]+)", t)}
    return found


def clean_schema(schema: dict | None, url_path: str) -> dict | None:
    if not schema:
        return None
    s = json.dumps(schema)
    s = s.replace(f"{SITE}/about-us/", f"{SITE}/about.html")
    s = s.replace(f"{SITE}/contact-us/", f"{SITE}/contact.html")
    data = json.loads(s)
    for node in data.get("@graph", []):
        if node.get("@type") == "WebSite":
            node.pop("potentialAction", None)  # site search does not exist any more
    return data


def text_excerpt(item: dict, limit: int = 220) -> str:
    y = item.get("yoast_head_json") or {}
    d = y.get("description") or re.sub(r"<[^>]+>", " ", item.get("excerpt", {}).get("rendered", ""))
    d = html.unescape(re.sub(r"\s+", " ", d)).strip()
    return d if len(d) <= limit else d[: limit - 1].rsplit(" ", 1)[0] + "…"


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

FONTS = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    '<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300;'
    '0,8..60,400;0,8..60,500;1,8..60,400&family=Figtree:wght@400;500;600&display=swap" rel="stylesheet">'
)

NAV = """<nav class="top">
  <div class="container row">
    <a href="/" class="logo">Vivander <span class="sub" style="margin-left:6px;">Advisors</span></a>
    <ul>
      <li><a href="/dont-be-invisible.html">Don't Be Invisible</a></li>
      <li><a href="/services.html">Services</a></li>
      <li><a href="/books.html">Books</a></li>
      <li><a href="/speaking.html">Speaking</a></li>
      <li><a href="/insights.html">Insights</a></li>
      <li><a href="/about.html">About</a></li>
    </ul>
    <a class="nav-cta" href="/contact.html">Book a 30-min call</a>
  </div>
</nav>"""

FOOTER = """<footer>
  <div class="container">
    <div class="row">
      <div>
        <div class="mark">Vivander <span class="sub">Advisors</span></div>
        <div class="tag">Helping executive teams become visible to AI, fluent with it, and better at the jobs it's changing.</div>
      </div>
      <div><h5>Product</h5><ul>
        <li><a href="/dont-be-invisible.html">Don't Be Invisible</a></li>
        <li><a href="/dont-be-invisible.html#how">How it works</a></li>
        <li><a href="/dont-be-invisible.html#access">Request access</a></li>
      </ul></div>
      <div><h5>Services</h5><ul>
        <li><a href="/services.html#discovery">AI Discovery</a></li>
        <li><a href="/services.html#training">AI Literacy &amp; Training</a></li>
        <li><a href="/services.html#scaling">AI Scaling</a></li>
        <li><a href="/speaking.html">Speaking</a></li>
      </ul></div>
      <div><h5>The firm</h5><ul>
        <li><a href="/about.html">About</a></li>
        <li><a href="/books.html">Books</a></li>
        <li><a href="/insights.html">Insights</a></li>
        <li><a href="/contact.html">Book a call</a></li>
      </ul></div>
    </div>
    <div class="base"><span>© 2026 Vivander Advisors · New York</span><span>Partner-led · Operator-built</span></div>
  </div>
</footer>"""


def esc(s: str) -> str:
    return html.escape(html.unescape(s or ""), quote=True)


def head_meta(y: dict, url_path: str, schema: dict | None) -> str:
    canonical = SITE + url_path
    title = y.get("title") or "Vivander Advisors"
    desc = y.get("description") or ""
    tags = [
        f"<title>{esc(title)}</title>",
        f'<meta name="description" content="{esc(desc)}">',
        f'<link rel="canonical" href="{canonical}">',
        '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">',
        f'<meta property="og:type" content="{esc(y.get("og_type", "article"))}">',
        f'<meta property="og:title" content="{esc(y.get("og_title") or title)}">',
        f'<meta property="og:description" content="{esc(y.get("og_description") or desc)}">',
        f'<meta property="og:url" content="{canonical}">',
        '<meta property="og:site_name" content="Vivander Advisors">',
    ]
    for img in y.get("og_image") or []:
        if img.get("url"):
            tags.append(f'<meta property="og:image" content="{esc(img["url"])}">')
    for key in ("article_published_time", "article_modified_time"):
        if y.get(key):
            tags.append(f'<meta property="{key.replace("_", ":", 1)}" content="{esc(y[key])}">')
    tags.append(f'<meta name="twitter:card" content="{esc(y.get("twitter_card", "summary_large_image"))}">')
    if schema:
        tags.append(jsonld(schema))
    return "\n".join(tags)


def jsonld(data: dict) -> str:
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return f'<script type="application/ld+json">{body}</script>'


def render_item(item: dict, kind: str) -> tuple[str, str]:
    """Return (url_path, html) for a post or migrated page."""
    url_path = urllib.parse.urlparse(item["link"]).path
    y = item.get("yoast_head_json") or {}
    content = clean_content(item["content"]["rendered"])
    schema = clean_schema(y.get("schema"), url_path)
    title = item["title"]["rendered"]
    published = (item.get("date_gmt") or "")[:10]
    nice_date = dt.date.fromisoformat(published).strftime("%B %-d, %Y") if published else ""

    cta = """<aside class="article-cta container-narrow">
<p>Want to know how ChatGPT, Gemini, Perplexity and Claude describe your business today?</p>
<a class="btn btn-primary" href="/contact.html">Book a 30-min call →</a>
</aside>"""
    has_h1 = re.search(r"<h1\b", content)
    style_len = sum(len(m) for m in re.findall(r"<style[^>]*>(.*?)</style>", content, re.S))
    if has_h1 and style_len > 1000:
        # Custom-built WordPress page that carries its own hero and styles.
        body = f'<main class="legacy-page">\n{content}\n</main>'
    elif has_h1:
        # Article that writes its own headline; give it the article frame only.
        body = f'<main><article class="prose article-body article-own-head">\n{content}\n</article>\n{cta}</main>'
    else:
        eyebrow = "Article" if kind == "posts" else "Resource"
        byline = f"Michael J. Goldrich · {nice_date}" if kind == "posts" and nice_date else "Vivander Advisors"
        body = f"""<header class="page-head article-head"><div class="container-narrow">
<div class="eyebrow"><a href="/insights.html">Insights</a> · {eyebrow}</div>
<h1>{title}</h1>
<p class="article-meta">{esc(byline)}</p>
</div></header>
<main><article class="prose article-body">
{content}
</article>
{cta}</main>"""

    page = f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
{head_meta(y, url_path, schema)}
{FONTS}
<link rel="stylesheet" href="/styles.css">
<link rel="alternate" type="application/rss+xml" title="Vivander Advisors" href="/feed.xml">
</head>
<body>
{NAV}
{body}
{FOOTER}
</body></html>
"""
    return url_path, page


# ---------------------------------------------------------------------------
# Core page SEO (hand-built pages)
# ---------------------------------------------------------------------------

ORG_NODE = {
    "@type": "Organization",
    "@id": ORG_ID,
    "name": "Vivander Advisors",
    "alternateName": "Vivander",
    "url": SITE + "/",
    "logo": {"@type": "ImageObject", "url": LOGO_URL, "width": 1774, "height": 887},
    "description": "Vivander Advisors is an AI Discovery firm. It helps businesses get found and "
    "recommended by ChatGPT, Gemini, Perplexity and Claude, trains executive teams to use AI, "
    "and scales the AI workflows that move revenue.",
    "email": "info@vivander.com",
    "telephone": "+1-347-414-7040",
    "address": {"@type": "PostalAddress", "addressLocality": "New York", "addressRegion": "NY", "addressCountry": "US"},
    "founder": {"@id": PERSON_ID},
    "sameAs": ["https://www.linkedin.com/company/vivander-advisors"],
    "knowsAbout": ["AI search visibility", "Answer engine optimization", "Generative engine optimization",
                   "AI literacy", "Hospitality commercial strategy", "AI agents"],
}

PERSON_NODE = {
    "@type": "Person",
    "@id": PERSON_ID,
    "name": "Michael J. Goldrich",
    "url": SITE + "/about.html",
    "image": PORTRAIT_URL,
    "jobTitle": "Founder and Chief Advisor",
    "worksFor": {"@id": ORG_ID},
    "description": "Founder of Vivander Advisors and former Chief Experience Officer at The Hotels Network, "
    "with senior commercial roles at Starwood Hotels & Resorts, Wyndham, Club Quarters, Accenture and Monster.",
    "award": ["HSMAI Top 25 Most Extraordinary Minds in Hospitality", "HSMAI Adrian Award"],
    "knowsAbout": ["AI search visibility", "AI literacy", "Hospitality marketing", "AI agents"],
    "sameAs": ["https://www.linkedin.com/in/michaelgoldrich"],
}

WEBSITE_NODE = {"@type": "WebSite", "@id": WEBSITE_ID, "url": SITE + "/", "name": "Vivander Advisors",
                "publisher": {"@id": ORG_ID}, "inLanguage": "en-US"}


def core_schema(kind: str, url_path: str, title: str, desc: str) -> dict:
    url = SITE + url_path
    page_type = {"about": "AboutPage", "contact": "ContactPage", "insights": "CollectionPage"}.get(kind, "WebPage")
    page = {"@type": page_type, "@id": url + "#webpage", "url": url, "name": title, "description": desc,
            "isPartOf": {"@id": WEBSITE_ID}, "about": {"@id": ORG_ID}, "inLanguage": "en-US"}
    graph = [page, ORG_NODE, WEBSITE_NODE, PERSON_NODE]
    if kind == "about":
        page["mainEntity"] = {"@id": PERSON_ID}
    if kind in ("services", "home"):
        services = [
            ("discovery", "AI Discovery", "A visibility audit across ChatGPT, Gemini, Perplexity and Claude, a category "
             "strategy, an implementation plan for your team or agency, and ongoing tracking."),
            ("training", "AI Literacy & Training", "Practical AI training that makes executive teams and staff fluent "
             "with the tools they already have."),
            ("scaling", "AI Scaling", "Turning promising AI pilots into workflows with measurable P&L impact."),
        ]
        for sid, name, d in services:
            graph.append({"@type": "Service", "@id": f"{SITE}/services.html#{sid}", "name": name, "description": d,
                          "provider": {"@id": ORG_ID}, "areaServed": "Worldwide",
                          "url": f"{SITE}/services.html#{sid}"})
    if kind == "product":
        graph.append({"@type": "SoftwareApplication", "@id": url + "#app", "name": "Don't Be Invisible",
                      "applicationCategory": "BusinessApplication", "operatingSystem": "Web",
                      "description": "Tracks how ChatGPT, Gemini, Perplexity and Claude describe and recommend a "
                      "business, monitors competitor website changes, and turns visibility gaps into a weekly to-do list.",
                      "publisher": {"@id": ORG_ID}, "url": url})
    if kind == "books":
        for bid, name, d in [
            ("invisible", "Invisible: What to Do When AI Erases Your Business",
             "A working playbook for how answer engines decide what to recommend and how businesses restore visibility."),
            ("literacy", "The AI Literacy Playbook",
             "A non-technical curriculum that gives executive teams a shared operating language for AI."),
            ("hats", "Too Many Hats, Too Little Time", "A book on modern leadership and the work AI is changing."),
        ]:
            graph.append({"@type": "Book", "@id": f"{url}#{bid}", "name": name, "description": d,
                          "author": {"@id": PERSON_ID}, "publisher": {"@id": ORG_ID}, "url": f"{url}#{bid}"})
    if kind == "speaking":
        graph.append({"@type": "Service", "@id": url + "#keynotes", "name": "Keynotes and executive briefings",
                      "serviceType": "Keynote speaking", "provider": {"@id": PERSON_ID},
                      "description": "Keynotes by Michael J. Goldrich, including The George Jetson Moment Is Here.",
                      "url": url})
    return {"@context": "https://schema.org", "@graph": graph}


def replace_block(text: str, name: str, block: str, anchor: str, before: bool = True) -> str:
    start, end = f"<!-- generated:{name} -->", f"<!-- /generated:{name} -->"
    full = f"{start}\n{block}\n{end}"
    if start in text:
        return re.sub(re.escape(start) + r".*?" + re.escape(end), lambda _: full, text, flags=re.S)
    i = text.index(anchor)
    return text[:i] + full + "\n" + text[i:] if before else text[: i + len(anchor)] + "\n" + full + text[i + len(anchor):]


def update_core_pages() -> None:
    for fname, url_path, _prio, kind in CORE_PAGES:
        path = ROOT / fname
        text = path.read_text()
        title = html.unescape(re.search(r"<title>(.*?)</title>", text, re.S).group(1)).strip()
        desc = html.unescape(re.search(r'<meta name="description" content="([^"]*)"', text).group(1))
        canonical = SITE + url_path
        block = "\n".join([
            f'<link rel="canonical" href="{canonical}">',
            '<meta property="og:type" content="website">',
            f'<meta property="og:title" content="{esc(title)}">',
            f'<meta property="og:description" content="{esc(desc)}">',
            f'<meta property="og:url" content="{canonical}">',
            '<meta property="og:site_name" content="Vivander Advisors">',
            f'<meta property="og:image" content="{PORTRAIT_URL}">',
            '<meta name="twitter:card" content="summary_large_image">',
            '<link rel="alternate" type="application/rss+xml" title="Vivander Advisors" href="/feed.xml">',
            jsonld(core_schema(kind, url_path, title, desc)),
        ])
        text = replace_block(text, "seo", block, "</head>")
        path.write_text(text)


def update_insights(posts: list[dict], pages: list[dict]) -> None:
    def row(item: dict, label: str) -> str:
        p = urllib.parse.urlparse(item["link"]).path
        d = (item.get("date_gmt") or "")[:10]
        when = dt.date.fromisoformat(d).strftime("%b %Y") if d else ""
        return (f'  <a class="article-row" href="{p}"><span class="date">{when}</span>'
                f'<h3>{item["title"]["rendered"]}</h3><span class="src">{label} <span class="arrow">→</span></span></a>')

    guides = sorted(pages, key=lambda x: x.get("date_gmt") or "", reverse=True)
    guides = [g for g in guides if g["slug"] != "privacy-policy"]
    articles = sorted(posts, key=lambda x: x.get("date_gmt") or "", reverse=True)
    block = f"""<section id="library"><div class="container">
<div class="sec-head"><div class="eyebrow">Library</div><h2>Guides, research and business cases.</h2><p class="sec-intro">Long-form resources on AI visibility, AI agents and AI literacy.</p></div>
<div>
{chr(10).join(row(g, "Vivander · Guide") for g in guides)}
</div>
</div></section>

<section id="archive"><div class="container">
<div class="sec-head"><div class="eyebrow">Archive</div><h2>Every article.</h2><p class="sec-intro">{len(articles)} articles, newest first.</p></div>
<div>
{chr(10).join(row(a, "Vivander · Article") for a in articles)}
</div>
</div></section>"""
    path = ROOT / "insights.html"
    text = path.read_text()
    text = replace_block(text, "archive", block, '<section class="cta">')
    path.write_text(text)


# ---------------------------------------------------------------------------
# Site files
# ---------------------------------------------------------------------------


def write_redirects(migrated_paths: set[str]) -> None:
    lines = [
        "# Generated by scripts/migrate_wordpress.py. Edit the script, then re-run it.",
        "# Netlify uses the first matching rule. Files that exist are served before any rule here.",
        "",
        "# Short paths for the new pages",
    ]
    lines += [f"{src:<50} {dst:<28} 301" for src, dst in LEGACY_REDIRECTS.items()]
    lines += ["", "# Retired WordPress pages, sent to the page that now does their job"]
    for src, dst in PAGE_REDIRECTS.items():
        if src in migrated_paths:
            sys.exit(f"{src} is both migrated and redirected")
        lines.append(f"{src:<50} {dst:<28} 301")
    lines += ["", "# WordPress archives, feeds and sitemaps"]
    lines += [f"{src:<50} {dst:<28} 301" for src, dst in WILDCARD_REDIRECTS]
    (ROOT / "_redirects").write_text("\n".join(lines) + "\n")


def write_sitemap(entries: list[tuple[str, str, str]]) -> None:
    urls = "\n".join(
        f"  <url><loc>{SITE}{p}</loc><lastmod>{lm}</lastmod><priority>{pr}</priority></url>" for p, lm, pr in entries
    )
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "\n</urlset>\n"
    )


def write_robots() -> None:
    bots = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User",
            "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot",
            "meta-externalagent", "Amazonbot", "DuckAssistBot", "MistralAI-User", "YouBot"]
    body = ["# Vivander Advisors wants to be found by people and by AI.", "# Every crawler is welcome.", ""]
    body += ["User-agent: *", "Allow: /", ""]
    body += ["# AI crawlers, named explicitly so no default policy can shut them out"]
    for b in bots:
        body += [f"User-agent: {b}", "Allow: /", ""]
    body += [f"Sitemap: {SITE}/sitemap.xml"]
    (ROOT / "robots.txt").write_text("\n".join(body) + "\n")


def write_llms(posts: list[dict], pages: list[dict]) -> None:
    def link(item: dict) -> str:
        p = urllib.parse.urlparse(item["link"]).path
        t = html.unescape(re.sub(r"<[^>]+>", "", item["title"]["rendered"])).strip()
        return f"- [{t}]({SITE}{p}): {text_excerpt(item, 160)}"

    by_slug = {p["slug"]: p for p in pages}
    guides = [by_slug[s.split("/")[-1]] for s in MIGRATE_PAGES
              if s.split("/")[-1] in by_slug and s != "privacy-policy"]
    recent = sorted(posts, key=lambda x: x.get("date_gmt") or "", reverse=True)[:30]
    text = f"""# Vivander Advisors

> Vivander Advisors is an AI Discovery firm based in New York. It helps businesses get found and recommended by ChatGPT, Gemini, Perplexity and Claude. Founder Michael J. Goldrich wrote Invisible: What to Do When AI Erases Your Business. The firm also runs Don't Be Invisible, a platform that tracks how AI engines describe and recommend a business.

Vivander works with executive teams, with deep roots in hospitality: hotels, restaurants and travel brands. It acts as an independent check on a company's SEO and digital agencies. Engagements are led by Michael J. Goldrich, former Chief Experience Officer at The Hotels Network, with senior roles at Starwood, Wyndham, Club Quarters, Accenture and Monster. Contact: info@vivander.com, +1-347-414-7040.

## Core pages

- [Home]({SITE}/): What Vivander does and why AI discovery matters.
- [Services]({SITE}/services.html): AI Discovery (diagnose, strategize, implement, track), AI Literacy and Training, and AI Scaling.
- [Don't Be Invisible]({SITE}/dont-be-invisible.html): Platform for AI visibility tracking, competitor monitoring and weekly action lists.
- [Books]({SITE}/books.html): Invisible, The AI Literacy Playbook, and Too Many Hats, Too Little Time.
- [Speaking]({SITE}/speaking.html): Keynotes by Michael J. Goldrich, including The George Jetson Moment Is Here.
- [About]({SITE}/about.html): Michael J. Goldrich's background and why the firm exists.
- [Contact]({SITE}/contact.html): Book a 30-minute call.

## Guides and research

{chr(10).join(link(g) for g in guides)}

## Recent articles

{chr(10).join(link(p) for p in recent)}

## Optional

- [All articles]({SITE}/insights.html): Full archive of {len(posts)} articles.
- [Sitemap]({SITE}/sitemap.xml)
"""
    (ROOT / "llms.txt").write_text(text)


def write_feed(posts: list[dict]) -> None:
    recent = sorted(posts, key=lambda x: x.get("date_gmt") or "", reverse=True)[:25]
    items = []
    for p in recent:
        path = urllib.parse.urlparse(p["link"]).path
        when = dt.datetime.fromisoformat(p["date_gmt"]).replace(tzinfo=dt.timezone.utc)
        title = html.unescape(re.sub(r"<[^>]+>", "", p["title"]["rendered"]))
        items.append(
            f"<item><title>{html.escape(title)}</title><link>{SITE}{path}</link>"
            f'<guid isPermaLink="true">{SITE}{path}</guid>'
            f"<pubDate>{when.strftime('%a, %d %b %Y %H:%M:%S +0000')}</pubDate>"
            f"<description>{html.escape(text_excerpt(p, 400))}</description></item>"
        )
    (ROOT / "feed.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>'
        f"<title>Vivander Advisors</title><link>{SITE}/</link>"
        f'<atom:link href="{SITE}/feed.xml" rel="self" type="application/rss+xml"/>'
        "<description>Essays and research on AI visibility, AI agents and AI literacy.</description>"
        "<language>en-us</language>\n" + "\n".join(items) + "\n</channel></rss>\n"
    )


def write_404() -> None:
    (ROOT / "404.html").write_text(f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Page not found · Vivander Advisors</title>
<meta name="robots" content="noindex">
{FONTS}
<link rel="stylesheet" href="/styles.css">
</head>
<body>
{NAV}
<header class="page-head"><div class="container">
<div class="eyebrow">404</div>
<h1>This page has moved <em>or never existed.</em></h1>
<p class="lede">Try the <a class="kbd-link" href="/insights.html">full article archive</a>, or start from the <a class="kbd-link" href="/">home page</a>.</p>
</div></header>
{FOOTER}
</body></html>
""")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


VIDEO_EXT = (".mp4", ".mov", ".m4v", ".webm")


def download_uploads(paths: set[str]) -> list[str]:
    """Download images and documents. Videos are left out of git on purpose."""
    missing: list[str] = []

    def one(p: str) -> None:
        if p.lower().endswith(VIDEO_EXT):
            return
        dest = ROOT / p.lstrip("/")
        if dest.exists():
            return
        try:
            data = fetch(SITE + urllib.parse.quote(p))
        except Exception as e:  # noqa: BLE001
            missing.append(f"{p} ({e})")
            return
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)

    with cf.ThreadPoolExecutor(16) as pool:
        list(pool.map(one, sorted(paths)))
    return missing


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.environ.get("WP_CACHE", str(ROOT / ".wp-cache")))
    ap.add_argument("--skip-images", action="store_true")
    args = ap.parse_args()
    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)

    posts = fetch_collection("posts", cache)
    all_pages = fetch_collection("pages", cache)
    page_by_path = {urllib.parse.urlparse(p["link"]).path: p for p in all_pages}
    pages = []
    for slug in MIGRATE_PAGES:
        p = page_by_path.get(f"/{slug}/")
        if not p:
            sys.exit(f"Page /{slug}/ not found on the live site")
        pages.append(p)

    uploads: set[str] = {urllib.parse.urlparse(LOGO_URL).path, urllib.parse.urlparse(PORTRAIT_URL).path}
    sitemap: list[tuple[str, str, str]] = [(u, TODAY, pr) for _f, u, pr, _k in CORE_PAGES]
    migrated: set[str] = set()

    for kind, items in (("posts", posts), ("pages", pages)):
        for item in items:
            url_path, page = render_item(item, kind)
            out = ROOT / url_path.strip("/") / "index.html"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(page)
            migrated.add(url_path)
            uploads |= collect_uploads(page)
            lastmod = (item.get("modified_gmt") or item.get("date_gmt") or TODAY)[:10]
            sitemap.append((url_path, lastmod, "0.7" if kind == "pages" else "0.6"))

    # Robustness: every live sitemap URL must be migrated, redirected or deliberately dropped.
    handled = migrated | set(PAGE_REDIRECTS) | set(LEGACY_REDIRECTS) | {"/"}
    unhandled = sorted(
        p for p in page_by_path
        if p not in handled
        and (page_by_path[p].get("yoast_head_json") or {}).get("robots", {}).get("index") == "index"
    )

    update_core_pages()
    update_insights(posts, pages)
    write_redirects(migrated)
    write_sitemap(sitemap)
    write_robots()
    write_llms(posts, pages)
    write_feed(posts)
    write_404()

    missing = [] if args.skip_images else download_uploads(uploads)

    print(f"posts migrated:   {len(posts)}")
    print(f"pages migrated:   {len(pages)}")
    print(f"pages redirected: {len(PAGE_REDIRECTS)}")
    print(f"uploads referenced: {len(uploads)}, missing: {len(missing)}")
    for m in missing:
        print("  missing", m)
    videos = sorted(p for p in uploads if p.lower().endswith(VIDEO_EXT))
    if videos:
        print(f"videos not downloaded (need a video host before cutover): {len(videos)}")
        for v in videos:
            print("  ", v)
    if unhandled:
        print("indexable live pages with no decision:")
        for p in unhandled:
            print("  ", p)


if __name__ == "__main__":
    main()
