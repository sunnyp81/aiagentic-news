# aiagentic-news — Project Brain

> Per-repo brain, migrated from central claude-memory 2026-06-20. Canonical project memory now lives here.

## Current state

aiagentic.news — automated AI news curation site. AI-synthesised news at scale across 13 RSS/API sources.

- **What it is:** CF Worker (cron `0 */4 * * *`) scrapes 13 sources → CF Workers AI (Llama 3.1 8B) categorises/summarises → CF KV → GitHub Actions rebuild → Astro static (`output: 'static'`) → CF Pages.
- **Live status:** LIVE; domain `aiagentic.news` connected. Sitemap + Indexing API pushed (Apr 27). Service account is a verified GSC Owner.
- **Revenue:** £0 — pre-monetisation (ads blocked until CMP/consent banner added; E-E-A-T gaps block Google News).
- **Stack:** Astro 5 (static) + CF Pages + CF Worker + CF Workers AI + CF KV.
- **Deploy:** GitHub push → GitHub Actions build (KV access) → CF Pages. Worker deployed separately from `worker/src/index.ts`.
- **Key URLs:** site https://aiagentic.news · worker https://aiagentic-news-worker.sunnypat81.workers.dev · sitemap `/sitemap-index.xml` (300 URLs) · RSS `/rss.xml` (50 recent) · manual trigger `POST /trigger`.
- **GA4:** G-SWL1N3SZQ7 (in Base.astro). GSC property `sc-domain:aiagentic.news`. Bing site `https://aiagentic.news`.

## Key facts & warnings

- **Pipeline endpoints `/trigger`, `/test-write`, `/test-ai` are UNAUTHENTICATED** — cost-DoS vector (anyone can burn Workers AI + GitHub Actions quota). Add `Authorization: Bearer <env.TRIGGER_SECRET>` check. NOT yet done.
- **GA4 fires with no CMP / consent banner** — UK GDPR + ePrivacy violation. Required before any AdSense/Mediavine.
- **Scaled-content-abuse risk (Google Mar 2024 policy):** needs `/about` with named human editor + AI disclosure + correction policy — biggest single E-E-A-T signal for news.
- Sitemap is `/sitemap-index.xml` (NOT `/sitemap.xml` — that soft-404s to SPA shell; cosmetic). robots.txt references the right file.
- `Content-Signal: ai-train=no` in robots.txt is intentional (blocks training crawlers, not search). Cloudflare-managed.
- Story word count ~150-300 median — below the 400+ preferred for Google News Top Stories.
- CF resources (sunnypat81 account): KV STORIES `c9269bcbbb514123b5545ea50b86ce72`, KV DIGESTS `c0b30cf516c34cb5b0e0919855a49f6b`, KV FEED_STATE `f06e8066ce394e28a4a695e6242d0787`, Worker `aiagentic-news-worker`, Pages project `aiagentic-news`.
- Indexing service account: `indexing@sunny-seo-tools.iam.gserviceaccount.com` (project `sunny-seo-tools`). Key location: `C:\Users\sunny\mcp-servers\gsc-tokens\indexing-sa.json` (local; not in repo).
- StaticForms key + IndexNow key live on the site — stored in central memory as redacted pointers; never commit either to git.
- Sources (13): TechCrunch, The Verge, Ars Technica, Wired, The Decoder, VentureBeat, MIT Tech Review, OpenAI Blog, Anthropic Blog, DeepMind Blog, arXiv cs.AI, HackerNews, Reddit (r/artificial, r/MachineLearning).
- Contact form pattern: client-side `fetch()` POST to StaticForms + inline `#form-success` div swap (NOT redirectTo — avoids dashboard whitelist per domain).
- CSS glow borders (GlowCard/CategoryChips/SourceBadges): `padding:1px` + `overflow:hidden` + `isolation:isolate`, large conic-gradient `::before`, `.glow-content` covers centre. RainbowButton is a plain accent button (animated gradient border failed — CSS paint order).

## History

- **Apr 9** — Content quality pass (synthesize.ts: 300-450w prose, summary, key_takeaways), IndexNow push on KV write, RSS feed + autodiscovery, OG image zone-layout fix, StaticForms email capture, mobile responsive fixes.
- **Apr 14** — Contact form fix: switched to JS fetch + inline success div; added missing push-trigger workflow (commit `5d3059a`).
- **Apr 27** — Service account added to GSC as Owner; Google Indexing API push 50/50; Bing 41 URLs; sitemap submitted to both engines. Diagnosed earlier "sitemap broken" claim as wrong (it was the conventional-path soft-404, non-blocking).

## Pending TODOs (ranked)

1. Auth the worker pipeline endpoints (security/cost).
2. Add `_headers` cache-control for homepage (currently `max-age=0, must-revalidate` defeats edge cache).
3. `/about` with named editor + AI disclosure + correction policy (E-E-A-T).
4. CMP/consent banner before any ads.
5. NewsArticle JSON-LD: add `image`, `publisher.logo`, `dateModified`, `mainEntityOfPage`.
6. Lengthen stories to 400+ OR pivot to digest model; fix/remove the `2 min read` badge.
7. OG images off `workers.dev` (cold-start slow → social unfurls fail) — custom-route or pre-generate at build.
8. Newsletter delivery (Resend/Beehiiv); auto-post to Bluesky/X; upgrade synthesis to Claude Haiku.
