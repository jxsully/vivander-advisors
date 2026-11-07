# WordPress to static migration

The live site at vivanderadvisors.com runs on WordPress with Yoast. This redesign replaces it with static files on Netlify. This document records how the search and AI visibility the old site earned carries over, and what still needs a human decision before cutover.

Everything below is produced by `scripts/migrate_wordpress.py`. Re-run it any time before cutover to pick up new posts:

```bash
python3 scripts/migrate_wordpress.py
```

It needs the WordPress site to be live, because it reads from the WordPress REST API.

## What carries over

| Old site | New site |
| --- | --- |
| 180 posts | Republished at the same URL (`/slug/index.html`) with Yoast's title, description, canonical, Open Graph tags and schema graph |
| 31 content pages (guides, business cases, research, FAQ, privacy policy) | Republished at the same URL. Pages built with custom HTML keep their original styling |
| 35 pages the redesign replaces (services, products, about, books) | 301 to the closest new page. Full list in `_redirects` |
| Category, tag, author and pagination archives | 301 to `/insights.html` or `/about.html` |
| `/feed/` | 301 to `/feed.xml` (RSS, newest 25 articles) |
| Yoast sitemaps (`sitemap_index.xml` and its children) | 301 to `/sitemap.xml` (219 URLs) |
| `robots.txt` | Rebuilt. Allows every crawler and names the major AI crawlers explicitly |
| `llms.txt` | Rewritten around the current AI Discovery positioning. The old one opened with "Smart Growth with Efficiency" |
| Images in `/wp-content/uploads/` | 380 files downloaded to the same paths, so image URLs and Google Images entries survive |
| Schema on the hand-built pages | Added: Organization, WebSite, Person, Service, Book, SoftwareApplication, AboutPage, ContactPage, CollectionPage. The Organization and Person `@id` values match Yoast's, so the entity graph stays continuous |

`insights.html` now ends with a full library of every migrated guide and article. That gives each page an internal link, so none of them are orphans that only the sitemap knows about.

The catch-all rule `/* /index.html 404` is gone. Netlify serves `404.html` for unknown paths automatically.

## Decisions needed before cutover

1. **Nine videos are not in the repo.** They total 157 MB, too large for git. Three pages use them: `/revgen_2024_budget_personas/`, `/is-it-live-or-memorex-or-ai-generated/` and `/vibe-videoing-is-that-even-a-thing/`. Upload them to a video host (YouTube, Vimeo, Mux, or Netlify Large Media) and update those three pages. The script prints the full list on each run.
2. **WordPress has its own redirects that the API does not expose.** Two turned up through links in the content and are now in `_redirects`. Export the full list from the Yoast Premium or Redirection plugin and add any others to `PAGE_REDIRECTS` in the script.
3. **Customer area and checkout.** WordPress has `/customer-area/` and `/checkout/` pages, which point to a client portal and a payment flow. A static site cannot run either. Confirm nobody uses them, or move them to a hosted tool before cutover.
4. **`/revenue-manager-dashboard/`** is indexable on the live site with no visible content. It is left unmapped and will 404. Decide whether it needs a redirect.
5. **Analytics.** The live site loads Google Tag Manager (`GTM-MF5P385`). The redesign has no analytics, so traffic after cutover will not be measured until it is added.
6. **Placeholder content on the hand-built pages.** Most of the featured essays on `insights.html` and the order links on `books.html` still point to `#`. Only the George Jetson essay is wired to a real page.

## After cutover

- Submit `https://vivanderadvisors.com/sitemap.xml` in Google Search Console and Bing Webmaster Tools, and remove the old Yoast sitemap entries.
- Watch the Search Console Pages report for two weeks. A rise in "Not found (404)" means a URL slipped through. Add it to `PAGE_REDIRECTS` and re-run the script.
