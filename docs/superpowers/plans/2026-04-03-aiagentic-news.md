# aiagentic.news — AI News Curation Machine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an automated AI news curation site that scrapes 14+ sources every 4 hours, synthesizes content via Claude API, and auto-deploys to CF Pages as a polished dark-themed news site.

**Architecture:** CF Worker on cron scrapes RSS/APIs → Claude API deduplicates and synthesizes → writes to CF KV → triggers GitHub Actions → Astro builds static pages from KV data → deploys to CF Pages at aiagentic.news.

**Tech Stack:** Astro 6, Tailwind CSS v4, CF Workers, CF KV, Claude API (Haiku for categorisation, Sonnet for digests), GitHub Actions, Wrangler CLI.

**Repo:** `C:\Users\sunny\projects\aiagentic-news\`

**Credentials:** Stored in memory/master-builds.md (not committed). Set via env vars and wrangler secrets.

---

## File Structure

```
aiagentic-news/
├── src/
│   ├── pages/
│   │   ├── index.astro              # Homepage: latest digest hero + story feed
│   │   ├── about.astro              # About page
│   │   ├── digest/[date].astro      # Daily digest article
│   │   ├── story/[slug].astro       # Individual story
│   │   └── category/[name].astro    # Category filtered view
│   ├── components/
│   │   ├── StoryCard.astro          # Card for story feed
│   │   ├── DigestPreview.astro      # Digest summary card for homepage
│   │   ├── CategoryChips.astro      # Filter pills
│   │   ├── Header.astro             # Site header + nav
│   │   └── Footer.astro             # Site footer
│   ├── layouts/
│   │   └── Base.astro               # Dark theme shell, meta, fonts
│   ├── lib/
│   │   ├── kv.ts                    # Build-time KV data fetching
│   │   ├── categories.ts            # Category definitions + colours
│   │   └── types.ts                 # Shared TypeScript types
│   └── styles/
│       └── global.css               # Tailwind imports + custom props
├── worker/
│   ├── src/
│   │   ├── index.ts                 # Worker entry — cron handler
│   │   ├── sources/
│   │   │   ├── rss.ts               # Generic RSS parser
│   │   │   ├── hackernews.ts        # HN API parser
│   │   │   └── reddit.ts            # Reddit API parser
│   │   ├── dedup.ts                 # URL + fuzzy title dedup
│   │   ├── synthesize.ts            # Claude API — categorise, summarise, digest
│   │   └── types.ts                 # Worker-side types
│   ├── wrangler.toml                # Worker config with KV + cron
│   ├── package.json                 # Worker deps (separate from Astro)
│   └── tsconfig.json
├── .github/
│   └── workflows/
│       └── build-deploy.yml         # Astro build + CF Pages deploy
├── astro.config.mjs
├── package.json
├── tsconfig.json
├── wrangler.toml                    # CF Pages config (site)
└── .gitignore
```

---

## Task 1: Scaffold Project + Base Layout

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `wrangler.toml`, `.gitignore`
- Create: `src/styles/global.css`
- Create: `src/lib/types.ts`, `src/lib/categories.ts`
- Create: `src/layouts/Base.astro`
- Create: `src/components/Header.astro`, `src/components/Footer.astro`
- Create: `src/pages/about.astro`

- [ ] **Step 1: Create project directory and init**

```bash
mkdir -p C:/Users/sunny/projects/aiagentic-news
cd C:/Users/sunny/projects/aiagentic-news
npm init -y
npm install astro@latest @astrojs/sitemap @tailwindcss/vite tailwindcss
```

- [ ] **Step 2: Write package.json scripts**

Overwrite `package.json`:

```json
{
  "name": "aiagentic-news",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "deploy": "npm run build && npx wrangler pages deploy dist --project-name aiagentic-news --commit-dirty=true"
  },
  "dependencies": {
    "astro": "^6.0.0",
    "@astrojs/sitemap": "^6.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "tailwindcss": "^4.0.0"
  }
}
```

- [ ] **Step 3: Write astro.config.mjs**

```javascript
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://aiagentic.news',
  output: 'static',
  build: { format: 'directory' },
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
```

- [ ] **Step 4: Write tsconfig.json**

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
```

- [ ] **Step 5: Write wrangler.toml (Pages config)**

```toml
name = "aiagentic-news"
pages_build_output_dir = "dist"
compatibility_date = "2026-04-01"
```

- [ ] **Step 6: Write .gitignore**

```
node_modules/
dist/
.astro/
.wrangler/
.env
```

- [ ] **Step 7: Write src/styles/global.css**

```css
@import "tailwindcss";

@theme {
  --color-bg: #0f1219;
  --color-bg-card: #1a1f2e;
  --color-bg-hover: #242b3d;
  --color-border: #2a3144;
  --color-text: #e2e8f0;
  --color-text-muted: #94a3b8;
  --color-accent: #3b82f6;
  --color-accent-hover: #60a5fa;

  --color-cat-models: #8b5cf6;
  --color-cat-agents: #06b6d4;
  --color-cat-industry: #f59e0b;
  --color-cat-tools: #10b981;
  --color-cat-policy: #ef4444;
  --color-cat-hardware: #ec4899;
}

body {
  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}

a {
  color: var(--color-accent);
  text-decoration: none;
}
a:hover {
  color: var(--color-accent-hover);
}
```

- [ ] **Step 8: Write src/lib/types.ts**

```typescript
export interface Story {
  slug: string;
  title: string;
  summary: string;
  sources: { name: string; url: string }[];
  category: CategoryId;
  tags: string[];
  publishedAt: string;
  image: string | null;
}

export interface Digest {
  date: string;
  title: string;
  content: string;
  topStories: string[];
  publishedAt: string;
}

export type CategoryId =
  | 'models'
  | 'agents'
  | 'industry'
  | 'tools'
  | 'policy'
  | 'hardware';
```

- [ ] **Step 9: Write src/lib/categories.ts**

```typescript
import type { CategoryId } from './types';

export interface Category {
  id: CategoryId;
  label: string;
  color: string;
}

export const categories: Category[] = [
  { id: 'models', label: 'Models & Research', color: 'var(--color-cat-models)' },
  { id: 'agents', label: 'Agents & Autonomy', color: 'var(--color-cat-agents)' },
  { id: 'industry', label: 'Industry & Business', color: 'var(--color-cat-industry)' },
  { id: 'tools', label: 'Tools & Frameworks', color: 'var(--color-cat-tools)' },
  { id: 'policy', label: 'Policy & Ethics', color: 'var(--color-cat-policy)' },
  { id: 'hardware', label: 'Hardware & Infrastructure', color: 'var(--color-cat-hardware)' },
];

export function getCategoryById(id: CategoryId): Category {
  return categories.find((c) => c.id === id)!;
}
```

- [ ] **Step 10: Write src/layouts/Base.astro**

```astro
---
import '../styles/global.css';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';

interface Props {
  title: string;
  description?: string;
  ogType?: string;
}

const { title, description = 'AI news curated and synthesized daily from across the web.', ogType = 'website' } = Astro.props;
const canonicalUrl = new URL(Astro.url.pathname, Astro.site);
---
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title} | AI Agentic News</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonicalUrl} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:type" content={ogType} />
  <meta property="og:url" content={canonicalUrl} />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
</head>
<body class="min-h-screen flex flex-col">
  <Header />
  <main class="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
    <slot />
  </main>
  <Footer />
</body>
</html>
```

- [ ] **Step 11: Write src/components/Header.astro**

```astro
---
const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/about/', label: 'About' },
];
---
<header class="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
  <div class="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
    <a href="/" class="text-xl font-bold text-[var(--color-text)] hover:text-[var(--color-accent)]">
      <span class="text-[var(--color-accent)]">AI</span>Agentic<span class="text-[var(--color-text-muted)]">.news</span>
    </a>
    <nav class="flex gap-6">
      {navLinks.map(({ href, label }) => (
        <a href={href} class="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">{label}</a>
      ))}
    </nav>
  </div>
</header>
```

- [ ] **Step 12: Write src/components/Footer.astro**

```astro
<footer class="border-t border-[var(--color-border)] mt-12">
  <div class="max-w-5xl mx-auto px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">
    <p>&copy; {new Date().getFullYear()} AI Agentic News. Curated by AI, for AI enthusiasts.</p>
  </div>
</footer>
```

- [ ] **Step 13: Write src/pages/about.astro**

```astro
---
import Base from '../layouts/Base.astro';
---
<Base title="About" description="How AI Agentic News works — automated AI news curation from 14+ sources.">
  <h1 class="text-3xl font-bold mb-6">About AI Agentic News</h1>
  <div class="prose prose-invert max-w-none space-y-4 text-[var(--color-text-muted)]">
    <p class="text-lg">AI Agentic News is an automated news curation platform that aggregates, deduplicates, and synthesizes AI news from across the web every 4 hours.</p>
    <h2 class="text-xl font-semibold text-[var(--color-text)] mt-8">Sources</h2>
    <p>We pull from 14+ sources including TechCrunch, The Verge, Ars Technica, Wired, MIT Technology Review, arXiv, Hacker News, Reddit, and AI company blogs from OpenAI, Anthropic, and Google DeepMind.</p>
    <h2 class="text-xl font-semibold text-[var(--color-text)] mt-8">How It Works</h2>
    <p>A Cloudflare Worker runs every 4 hours, fetching the latest from all sources. Claude AI deduplicates overlapping stories, categorises them, and writes concise summaries. At midnight, a daily digest synthesizes the top stories into a long-form article. The site rebuilds automatically and deploys to Cloudflare Pages.</p>
    <h2 class="text-xl font-semibold text-[var(--color-text)] mt-8">Categories</h2>
    <ul class="list-disc pl-6 space-y-1">
      <li><strong>Models & Research</strong> — new model releases, benchmarks, papers</li>
      <li><strong>Agents & Autonomy</strong> — agentic AI, tool use, autonomous systems</li>
      <li><strong>Industry & Business</strong> — funding, acquisitions, enterprise adoption</li>
      <li><strong>Tools & Frameworks</strong> — developer tools, SDKs, open source</li>
      <li><strong>Policy & Ethics</strong> — regulation, safety, governance</li>
      <li><strong>Hardware & Infrastructure</strong> — chips, data centres, compute</li>
    </ul>
  </div>
</Base>
```

- [ ] **Step 14: Run dev server to verify base layout**

```bash
cd C:/Users/sunny/projects/aiagentic-news
npm install
npx astro dev
```

Visit `http://localhost:4321/about/` — confirm dark theme, header, footer render correctly.

- [ ] **Step 15: Init git and commit**

```bash
cd C:/Users/sunny/projects/aiagentic-news
git init
git add -A
git commit -m "feat: scaffold Astro project with dark theme base layout"
```

---

## Task 2: Homepage Components + Dummy Data

**Files:**
- Create: `src/components/StoryCard.astro`
- Create: `src/components/DigestPreview.astro`
- Create: `src/components/CategoryChips.astro`
- Create: `src/lib/kv.ts` (with dummy data for now)
- Create: `src/pages/index.astro`

- [ ] **Step 1: Write src/lib/kv.ts with dummy data**

This will later be replaced with real KV fetching. For now, hardcoded data lets us build all templates.

```typescript
import type { Story, Digest } from './types';

// --- Dummy data for development — replaced by KV fetch in Task 6 ---

const dummyStories: Story[] = [
  {
    slug: 'openai-gpt5-release',
    title: 'OpenAI Announces GPT-5 with Reasoning Breakthrough',
    summary: 'OpenAI has unveiled GPT-5, featuring a new reasoning architecture that significantly outperforms GPT-4 on complex multi-step tasks. The model is available immediately through the API and ChatGPT Plus.',
    sources: [
      { name: 'TechCrunch', url: 'https://example.com/1' },
      { name: 'The Verge', url: 'https://example.com/2' },
    ],
    category: 'models',
    tags: ['openai', 'gpt-5', 'llm'],
    publishedAt: '2026-04-03T14:00:00Z',
    image: null,
  },
  {
    slug: 'anthropic-claude-agent-sdk',
    title: 'Anthropic Launches Claude Agent SDK for Autonomous Workflows',
    summary: 'The new Agent SDK enables developers to build multi-step autonomous agents with built-in tool use, memory, and safety guardrails. Early adopters report 3x productivity gains in customer support automation.',
    sources: [{ name: 'Anthropic Blog', url: 'https://example.com/3' }],
    category: 'agents',
    tags: ['anthropic', 'claude', 'agents', 'sdk'],
    publishedAt: '2026-04-03T12:00:00Z',
    image: null,
  },
  {
    slug: 'eu-ai-act-enforcement',
    title: 'EU AI Act Enforcement Begins with First Compliance Audits',
    summary: 'The European Commission has launched its first wave of AI Act compliance audits, targeting high-risk AI systems in healthcare and finance. Companies have 90 days to demonstrate compliance.',
    sources: [
      { name: 'Wired', url: 'https://example.com/4' },
      { name: 'Ars Technica', url: 'https://example.com/5' },
    ],
    category: 'policy',
    tags: ['eu', 'regulation', 'ai-act'],
    publishedAt: '2026-04-03T10:00:00Z',
    image: null,
  },
  {
    slug: 'nvidia-b300-gpu',
    title: 'NVIDIA Unveils B300 GPU with 2x Training Performance',
    summary: 'The new Blackwell B300 GPU doubles training throughput over the B200 while maintaining the same power envelope. Major cloud providers have already placed orders for 2027 deployment.',
    sources: [{ name: 'The Verge', url: 'https://example.com/6' }],
    category: 'hardware',
    tags: ['nvidia', 'gpu', 'blackwell'],
    publishedAt: '2026-04-03T08:00:00Z',
    image: null,
  },
  {
    slug: 'langchain-v1-stable',
    title: 'LangChain 1.0 Stable Released After Two Years in Beta',
    summary: 'LangChain has finally hit 1.0 with a simplified API, native async support, and first-class streaming. The release drops legacy chains in favour of the LCEL expression language.',
    sources: [
      { name: 'Hacker News', url: 'https://example.com/7' },
      { name: 'Reddit', url: 'https://example.com/8' },
    ],
    category: 'tools',
    tags: ['langchain', 'open-source', 'frameworks'],
    publishedAt: '2026-04-03T06:00:00Z',
    image: null,
  },
  {
    slug: 'google-acquires-ai-startup',
    title: 'Google Acquires AI Agent Startup for $2.1 Billion',
    summary: 'Google has acquired Adept AI in a deal valued at $2.1 billion, bolstering its agent capabilities. The acquisition brings Adept\'s ACT-2 model and 150 researchers into Google DeepMind.',
    sources: [
      { name: 'TechCrunch', url: 'https://example.com/9' },
      { name: 'MIT Tech Review', url: 'https://example.com/10' },
    ],
    category: 'industry',
    tags: ['google', 'acquisition', 'adept'],
    publishedAt: '2026-04-02T20:00:00Z',
    image: null,
  },
];

const dummyDigests: Digest[] = [
  {
    date: '2026-04-03',
    title: 'AI News Digest — April 3, 2026',
    content: `## GPT-5 Drops, EU Enforcement Begins, and NVIDIA's Next GPU\n\nToday was one of the biggest days in AI this year. OpenAI released GPT-5 with a fundamentally new reasoning architecture, the EU launched its first AI Act compliance audits, and NVIDIA revealed the B300 GPU.\n\n### GPT-5: A New Reasoning Paradigm\n\nOpenAI's latest model represents a significant leap in multi-step reasoning...\n\n### EU Gets Serious About AI Regulation\n\nThe European Commission has moved from policy to enforcement...\n\n### Hardware Race Continues\n\nNVIDIA's B300 doubles training throughput...`,
    topStories: ['openai-gpt5-release', 'eu-ai-act-enforcement', 'nvidia-b300-gpu'],
    publishedAt: '2026-04-04T00:05:00Z',
  },
];

export async function getStories(): Promise<Story[]> {
  // TODO: Replace with CF KV fetch in Task 6
  return dummyStories.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

export async function getStoriesByCategory(category: string): Promise<Story[]> {
  const stories = await getStories();
  return stories.filter((s) => s.category === category);
}

export async function getStoryBySlug(slug: string): Promise<Story | undefined> {
  const stories = await getStories();
  return stories.find((s) => s.slug === slug);
}

export async function getDigests(): Promise<Digest[]> {
  // TODO: Replace with CF KV fetch in Task 6
  return dummyDigests.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

export async function getDigestByDate(date: string): Promise<Digest | undefined> {
  const digests = await getDigests();
  return digests.find((d) => d.date === date);
}

export async function getAllStorySlugs(): Promise<string[]> {
  const stories = await getStories();
  return stories.map((s) => s.slug);
}

export async function getAllDigestDates(): Promise<string[]> {
  const digests = await getDigests();
  return digests.map((d) => d.date);
}
```

- [ ] **Step 2: Write src/components/CategoryChips.astro**

```astro
---
import { categories } from '../lib/categories';
import type { CategoryId } from '../lib/types';

interface Props {
  active?: CategoryId | null;
}

const { active = null } = Astro.props;
---
<div class="flex flex-wrap gap-2 mb-6">
  <a
    href="/"
    class:list={[
      'px-3 py-1 rounded-full text-sm font-medium transition-colors',
      !active
        ? 'bg-[var(--color-accent)] text-white'
        : 'bg-[var(--color-bg-card)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]',
    ]}
  >
    All
  </a>
  {categories.map((cat) => (
    <a
      href={`/category/${cat.id}/`}
      class:list={[
        'px-3 py-1 rounded-full text-sm font-medium transition-colors',
        active === cat.id
          ? 'text-white'
          : 'bg-[var(--color-bg-card)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]',
      ]}
      style={active === cat.id ? `background-color: ${cat.color}` : ''}
    >
      {cat.label}
    </a>
  ))}
</div>
```

- [ ] **Step 3: Write src/components/StoryCard.astro**

```astro
---
import type { Story } from '../lib/types';
import { getCategoryById } from '../lib/categories';

interface Props {
  story: Story;
}

const { story } = Astro.props;
const cat = getCategoryById(story.category);
const date = new Date(story.publishedAt).toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
---
<article class="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg p-5 hover:bg-[var(--color-bg-hover)] transition-colors">
  <div class="flex items-center gap-3 mb-3">
    <span
      class="px-2 py-0.5 rounded text-xs font-medium text-white"
      style={`background-color: ${cat.color}`}
    >
      {cat.label}
    </span>
    <time class="text-xs text-[var(--color-text-muted)]">{date}</time>
  </div>
  <h3 class="text-lg font-semibold mb-2">
    <a href={`/story/${story.slug}/`} class="text-[var(--color-text)] hover:text-[var(--color-accent)]">
      {story.title}
    </a>
  </h3>
  <p class="text-sm text-[var(--color-text-muted)] mb-3">{story.summary}</p>
  <div class="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
    <span>Sources:</span>
    {story.sources.map((src, i) => (
      <>
        <a href={src.url} target="_blank" rel="noopener noreferrer" class="hover:text-[var(--color-accent)]">
          {src.name}
        </a>
        {i < story.sources.length - 1 && <span>·</span>}
      </>
    ))}
  </div>
</article>
```

- [ ] **Step 4: Write src/components/DigestPreview.astro**

```astro
---
import type { Digest } from '../lib/types';

interface Props {
  digest: Digest;
}

const { digest } = Astro.props;
const date = new Date(digest.publishedAt).toLocaleDateString('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const preview = digest.content.split('\n').slice(0, 3).join(' ').slice(0, 200) + '...';
---
<a href={`/digest/${digest.date}/`} class="block bg-gradient-to-r from-[var(--color-accent)]/10 to-[var(--color-bg-card)] border border-[var(--color-accent)]/30 rounded-lg p-6 hover:border-[var(--color-accent)]/60 transition-colors mb-8">
  <div class="flex items-center gap-2 mb-2">
    <span class="text-xs font-medium text-[var(--color-accent)] uppercase tracking-wide">Daily Digest</span>
    <time class="text-xs text-[var(--color-text-muted)]">{date}</time>
  </div>
  <h2 class="text-xl font-bold text-[var(--color-text)] mb-2">{digest.title}</h2>
  <p class="text-sm text-[var(--color-text-muted)]">{preview}</p>
  <span class="inline-block mt-3 text-sm text-[var(--color-accent)] font-medium">Read full digest →</span>
</a>
```

- [ ] **Step 5: Write src/pages/index.astro**

```astro
---
import Base from '../layouts/Base.astro';
import DigestPreview from '../components/DigestPreview.astro';
import CategoryChips from '../components/CategoryChips.astro';
import StoryCard from '../components/StoryCard.astro';
import { getStories, getDigests } from '../lib/kv';

const stories = await getStories();
const digests = await getDigests();
const latestDigest = digests[0];
---
<Base title="Latest AI News">
  {latestDigest && <DigestPreview digest={latestDigest} />}

  <CategoryChips />

  <div class="grid gap-4">
    {stories.map((story) => (
      <StoryCard story={story} />
    ))}
  </div>

  {stories.length === 0 && (
    <p class="text-center text-[var(--color-text-muted)] py-12">No stories yet. Check back soon.</p>
  )}
</Base>
```

- [ ] **Step 6: Run dev server and verify homepage**

```bash
cd C:/Users/sunny/projects/aiagentic-news
npx astro dev
```

Visit `http://localhost:4321/` — confirm digest preview, category chips, and story cards render with dark theme.

- [ ] **Step 7: Commit**

```bash
cd C:/Users/sunny/projects/aiagentic-news
git add -A
git commit -m "feat: homepage with story cards, digest preview, category chips"
```

---

## Task 3: Story, Digest, and Category Pages

**Files:**
- Create: `src/pages/story/[slug].astro`
- Create: `src/pages/digest/[date].astro`
- Create: `src/pages/category/[name].astro`

- [ ] **Step 1: Write src/pages/story/[slug].astro**

```astro
---
import Base from '../../layouts/Base.astro';
import { getStoryBySlug, getAllStorySlugs } from '../../lib/kv';
import { getCategoryById } from '../../lib/categories';

export async function getStaticPaths() {
  const slugs = await getAllStorySlugs();
  return slugs.map((slug) => ({ params: { slug } }));
}

const { slug } = Astro.params;
const story = await getStoryBySlug(slug!);

if (!story) {
  return Astro.redirect('/404');
}

const cat = getCategoryById(story.category);
const date = new Date(story.publishedAt).toLocaleDateString('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
---
<Base title={story.title} description={story.summary} ogType="article">
  <article class="max-w-3xl mx-auto">
    <div class="flex items-center gap-3 mb-4">
      <span
        class="px-2 py-0.5 rounded text-xs font-medium text-white"
        style={`background-color: ${cat.color}`}
      >
        {cat.label}
      </span>
      <time class="text-sm text-[var(--color-text-muted)]">{date}</time>
    </div>

    <h1 class="text-3xl font-bold mb-4">{story.title}</h1>

    <p class="text-lg text-[var(--color-text-muted)] mb-8 leading-relaxed">{story.summary}</p>

    <div class="border-t border-[var(--color-border)] pt-6">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-3">Sources</h2>
      <ul class="space-y-2">
        {story.sources.map((src) => (
          <li>
            <a href={src.url} target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]">
              <span>→</span>
              <span>{src.name}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>

    {story.tags.length > 0 && (
      <div class="mt-6 flex flex-wrap gap-2">
        {story.tags.map((tag) => (
          <span class="px-2 py-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded text-xs text-[var(--color-text-muted)]">
            #{tag}
          </span>
        ))}
      </div>
    )}

    <div class="mt-8">
      <a href="/" class="text-sm text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]">← Back to all stories</a>
    </div>
  </article>

  <script type="application/ld+json" set:html={JSON.stringify({
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": story.title,
    "description": story.summary,
    "datePublished": story.publishedAt,
    "author": { "@type": "Organization", "name": "AI Agentic News" },
    "publisher": { "@type": "Organization", "name": "AI Agentic News", "url": "https://aiagentic.news" },
  })} />
</Base>
```

- [ ] **Step 2: Write src/pages/digest/[date].astro**

```astro
---
import Base from '../../layouts/Base.astro';
import { getDigestByDate, getAllDigestDates, getStoryBySlug } from '../../lib/kv';

export async function getStaticPaths() {
  const dates = await getAllDigestDates();
  return dates.map((date) => ({ params: { date } }));
}

const { date } = Astro.params;
const digest = await getDigestByDate(date!);

if (!digest) {
  return Astro.redirect('/404');
}

const formattedDate = new Date(digest.publishedAt).toLocaleDateString('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const topStories = (
  await Promise.all(digest.topStories.map((slug) => getStoryBySlug(slug)))
).filter(Boolean);
---
<Base title={digest.title} description={`Daily AI news digest for ${formattedDate}`} ogType="article">
  <article class="max-w-3xl mx-auto">
    <div class="flex items-center gap-2 mb-4">
      <span class="text-xs font-medium text-[var(--color-accent)] uppercase tracking-wide">Daily Digest</span>
      <time class="text-sm text-[var(--color-text-muted)]">{formattedDate}</time>
    </div>

    <h1 class="text-3xl font-bold mb-8">{digest.title}</h1>

    <div class="prose prose-invert max-w-none text-[var(--color-text-muted)] leading-relaxed space-y-4" set:html={digest.content.replace(/\n/g, '<br/>')} />

    {topStories.length > 0 && (
      <div class="border-t border-[var(--color-border)] pt-6 mt-8">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-3">Stories in this digest</h2>
        <ul class="space-y-2">
          {topStories.map((story) => (
            <li>
              <a href={`/story/${story!.slug}/`} class="text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]">
                {story!.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    )}

    <div class="mt-8">
      <a href="/" class="text-sm text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]">← Back to all stories</a>
    </div>
  </article>

  <script type="application/ld+json" set:html={JSON.stringify({
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": digest.title,
    "datePublished": digest.publishedAt,
    "author": { "@type": "Organization", "name": "AI Agentic News" },
    "publisher": { "@type": "Organization", "name": "AI Agentic News", "url": "https://aiagentic.news" },
  })} />
</Base>
```

- [ ] **Step 3: Write src/pages/category/[name].astro**

```astro
---
import Base from '../../layouts/Base.astro';
import StoryCard from '../../components/StoryCard.astro';
import CategoryChips from '../../components/CategoryChips.astro';
import { getStoriesByCategory } from '../../lib/kv';
import { categories } from '../../lib/categories';
import type { CategoryId } from '../../lib/types';

export function getStaticPaths() {
  return categories.map((cat) => ({
    params: { name: cat.id },
    props: { category: cat },
  }));
}

const { category } = Astro.props;
const stories = await getStoriesByCategory(category.id as CategoryId);
---
<Base title={category.label} description={`Latest AI news in ${category.label}`}>
  <h1 class="text-3xl font-bold mb-6">{category.label}</h1>

  <CategoryChips active={category.id} />

  <div class="grid gap-4">
    {stories.map((story) => (
      <StoryCard story={story} />
    ))}
  </div>

  {stories.length === 0 && (
    <p class="text-center text-[var(--color-text-muted)] py-12">No stories in this category yet.</p>
  )}
</Base>
```

- [ ] **Step 4: Verify all pages render**

```bash
cd C:/Users/sunny/projects/aiagentic-news
npx astro build
```

Expected: successful build with pages at `/`, `/about/`, `/story/openai-gpt5-release/`, `/digest/2026-04-03/`, `/category/models/`, etc.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/sunny/projects/aiagentic-news
git add -A
git commit -m "feat: story, digest, and category page templates"
```

---

## Task 4: CF Worker — RSS + API Source Parsers

**Files:**
- Create: `worker/package.json`, `worker/tsconfig.json`, `worker/wrangler.toml`
- Create: `worker/src/types.ts`
- Create: `worker/src/sources/rss.ts`
- Create: `worker/src/sources/hackernews.ts`
- Create: `worker/src/sources/reddit.ts`

- [ ] **Step 1: Write worker/package.json**

```json
{
  "name": "aiagentic-news-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.0.0",
    "typescript": "^5.0.0",
    "wrangler": "^4.0.0"
  }
}
```

- [ ] **Step 2: Write worker/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write worker/wrangler.toml**

Note: KV namespace IDs are created at deploy time. Placeholders here — replace after `wrangler kv namespace create`.

```toml
name = "aiagentic-news-worker"
main = "src/index.ts"
compatibility_date = "2026-04-01"

[triggers]
crons = ["0 */4 * * *"]

[[kv_namespaces]]
binding = "STORIES"
id = "REPLACE_AFTER_CREATE"

[[kv_namespaces]]
binding = "DIGESTS"
id = "REPLACE_AFTER_CREATE"

[[kv_namespaces]]
binding = "FEED_STATE"
id = "REPLACE_AFTER_CREATE"

[vars]
GITHUB_OWNER = "sunnyp81"
GITHUB_REPO = "aiagentic-news"
```

- [ ] **Step 4: Write worker/src/types.ts**

```typescript
export interface RawItem {
  title: string;
  url: string;
  source: string;
  summary: string;
  publishedAt: string;
}

export interface Story {
  slug: string;
  title: string;
  summary: string;
  sources: { name: string; url: string }[];
  category: string;
  tags: string[];
  publishedAt: string;
  image: string | null;
}

export interface Digest {
  date: string;
  title: string;
  content: string;
  topStories: string[];
  publishedAt: string;
}

export interface Env {
  STORIES: KVNamespace;
  DIGESTS: KVNamespace;
  FEED_STATE: KVNamespace;
  ANTHROPIC_API_KEY: string;
  GITHUB_PAT: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  REDDIT_CLIENT_ID?: string;
  REDDIT_CLIENT_SECRET?: string;
}

export interface SourceConfig {
  id: string;
  name: string;
  feedUrl: string;
  type: 'rss' | 'hackernews' | 'reddit';
}
```

- [ ] **Step 5: Write worker/src/sources/rss.ts**

```typescript
import type { RawItem } from '../types';

interface RssItem {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
}

function extractItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/)?.[1] || block.match(/<title>(.*?)<\/title>/)?.[1] || '';
    const link = block.match(/<link>(.*?)<\/link>/)?.[1] || '';
    const description = block.match(/<description><!\[CDATA\[(.*?)\]\]>|<description>(.*?)<\/description>/)?.[1] || '';
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';

    if (title && link) {
      items.push({ title: title.trim(), link: link.trim(), description: description.trim(), pubDate: pubDate.trim() });
    }
  }

  // Also handle Atom feeds (<entry> with <link href="...">)
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title.*?>(.*?)<\/title>/)?.[1] || '';
    const link = block.match(/<link.*?href="(.*?)"/)?.[1] || '';
    const summary = block.match(/<summary.*?>(.*?)<\/summary>/)?.[1] || '';
    const published = block.match(/<published>(.*?)<\/published>/)?.[1] || block.match(/<updated>(.*?)<\/updated>/)?.[1] || '';

    if (title && link) {
      items.push({ title: title.trim(), link: link.trim(), description: summary.trim(), pubDate: published.trim() });
    }
  }

  return items;
}

export async function fetchRss(feedUrl: string, sourceName: string, since: string | null): Promise<RawItem[]> {
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': 'AIAgenticNews/1.0 (https://aiagentic.news)' },
    });
    if (!res.ok) {
      console.error(`RSS fetch failed for ${sourceName}: ${res.status}`);
      return [];
    }

    const xml = await res.text();
    const items = extractItems(xml);

    return items
      .filter((item) => {
        if (!item.pubDate) return true;
        return new Date(item.pubDate) > sinceDate;
      })
      .map((item) => ({
        title: item.title,
        url: item.link,
        source: sourceName,
        summary: item.description?.replace(/<[^>]*>/g, '').slice(0, 300) || '',
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      }));
  } catch (err) {
    console.error(`RSS error for ${sourceName}:`, err);
    return [];
  }
}
```

- [ ] **Step 6: Write worker/src/sources/hackernews.ts**

```typescript
import type { RawItem } from '../types';

const HN_TOP_URL = 'https://hacker-news.firebaseio.com/v0/topstories.json';
const HN_ITEM_URL = 'https://hacker-news.firebaseio.com/v0/item';

interface HNItem {
  id: number;
  title: string;
  url?: string;
  score: number;
  time: number;
  type: string;
}

export async function fetchHackerNews(since: string | null): Promise<RawItem[]> {
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const res = await fetch(HN_TOP_URL);
    if (!res.ok) return [];

    const ids: number[] = await res.json();
    const top30 = ids.slice(0, 30);

    const items = await Promise.all(
      top30.map(async (id) => {
        const r = await fetch(`${HN_ITEM_URL}/${id}.json`);
        if (!r.ok) return null;
        return r.json() as Promise<HNItem>;
      })
    );

    return items
      .filter((item): item is HNItem => {
        if (!item || !item.url || item.type !== 'story') return false;
        const itemDate = new Date(item.time * 1000);
        return itemDate > sinceDate && item.score > 50;
      })
      .filter((item) => {
        const title = item.title.toLowerCase();
        return title.includes('ai') || title.includes('llm') || title.includes('gpt') ||
               title.includes('claude') || title.includes('machine learning') ||
               title.includes('neural') || title.includes('transformer') ||
               title.includes('agent') || title.includes('openai') ||
               title.includes('anthropic') || title.includes('deepmind') ||
               title.includes('gemini') || title.includes('model');
      })
      .map((item) => ({
        title: item.title,
        url: item.url!,
        source: 'Hacker News',
        summary: '',
        publishedAt: new Date(item.time * 1000).toISOString(),
      }));
  } catch (err) {
    console.error('HackerNews error:', err);
    return [];
  }
}
```

- [ ] **Step 7: Write worker/src/sources/reddit.ts**

```typescript
import type { RawItem } from '../types';

const SUBREDDITS = ['artificial', 'MachineLearning'];

interface RedditPost {
  data: {
    title: string;
    url: string;
    selftext: string;
    created_utc: number;
    score: number;
    is_self: boolean;
    permalink: string;
  };
}

interface RedditListing {
  data: {
    children: RedditPost[];
  };
}

async function getRedditToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'AIAgenticNews/1.0',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

export async function fetchReddit(
  clientId: string | undefined,
  clientSecret: string | undefined,
  since: string | null
): Promise<RawItem[]> {
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Fall back to public JSON API if no credentials
  const useAuth = clientId && clientSecret;
  let token = '';
  if (useAuth) {
    try {
      token = await getRedditToken(clientId, clientSecret);
    } catch {
      console.error('Reddit auth failed, falling back to public API');
    }
  }

  const items: RawItem[] = [];

  for (const sub of SUBREDDITS) {
    try {
      const url = token
        ? `https://oauth.reddit.com/r/${sub}/hot.json?limit=25`
        : `https://www.reddit.com/r/${sub}/hot.json?limit=25`;

      const headers: Record<string, string> = { 'User-Agent': 'AIAgenticNews/1.0' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(url, { headers });
      if (!res.ok) continue;

      const listing: RedditListing = await res.json();

      for (const post of listing.data.children) {
        const { title, url: postUrl, selftext, created_utc, score, is_self, permalink } = post.data;
        const postDate = new Date(created_utc * 1000);

        if (postDate <= sinceDate || score < 50) continue;

        items.push({
          title,
          url: is_self ? `https://www.reddit.com${permalink}` : postUrl,
          source: `Reddit r/${sub}`,
          summary: selftext?.slice(0, 300).replace(/\n/g, ' ') || '',
          publishedAt: postDate.toISOString(),
        });
      }
    } catch (err) {
      console.error(`Reddit error for r/${sub}:`, err);
    }
  }

  return items;
}
```

- [ ] **Step 8: Install worker deps and verify TypeScript compiles**

```bash
cd C:/Users/sunny/projects/aiagentic-news/worker
npm install
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 9: Commit**

```bash
cd C:/Users/sunny/projects/aiagentic-news
git add -A
git commit -m "feat: CF Worker source parsers — RSS, HackerNews, Reddit"
```

---

## Task 5: Worker — Dedup, Claude Synthesis, and Cron Handler

**Files:**
- Create: `worker/src/dedup.ts`
- Create: `worker/src/synthesize.ts`
- Create: `worker/src/index.ts`

- [ ] **Step 1: Write worker/src/dedup.ts**

```typescript
import type { RawItem } from './types';

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a: string, b: string): number {
  const wordsA = new Set(normalizeTitle(a).split(' '));
  const wordsB = new Set(normalizeTitle(b).split(' '));
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size; // Jaccard similarity
}

export function deduplicateItems(items: RawItem[]): RawItem[][] {
  const groups: RawItem[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;

    const group: RawItem[] = [items[i]];
    used.add(i);

    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j)) continue;

      // Same URL = definite duplicate
      if (items[i].url === items[j].url) {
        group.push(items[j]);
        used.add(j);
        continue;
      }

      // Fuzzy title match — threshold 0.6
      if (similarity(items[i].title, items[j].title) > 0.6) {
        group.push(items[j]);
        used.add(j);
      }
    }

    groups.push(group);
  }

  return groups;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
    .replace(/-$/, '');
}
```

- [ ] **Step 2: Write worker/src/synthesize.ts**

```typescript
import type { RawItem, Story, Digest } from './types';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  content: { type: string; text: string }[];
}

async function callClaude(
  apiKey: string,
  model: string,
  system: string,
  messages: ClaudeMessage[]
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data: ClaudeResponse = await res.json();
  return data.content[0].text;
}

export async function categorizeAndSummarize(
  apiKey: string,
  groups: RawItem[][]
): Promise<Story[]> {
  const CATEGORIES = ['models', 'agents', 'industry', 'tools', 'policy', 'hardware'];

  // Batch all groups into one API call for efficiency
  const prompt = groups.map((group, i) => {
    const titles = group.map((item) => `- "${item.title}" (${item.source})`).join('\n');
    const summaries = group.map((item) => item.summary).filter(Boolean).join(' ');
    return `Story ${i + 1}:\nTitles:\n${titles}\nContext: ${summaries.slice(0, 500)}`;
  }).join('\n\n---\n\n');

  const system = `You are a news editor for an AI news site. For each story group, output a JSON array with one object per story containing:
- "title": a clear, engaging headline (not copied from any source)
- "summary": 2-3 sentence synthesis of the story
- "category": one of ${JSON.stringify(CATEGORIES)}
- "tags": 2-5 lowercase tags

Output ONLY valid JSON array, no markdown fences.`;

  const raw = await callClaude(apiKey, 'claude-haiku-4-5-20251001', system, [
    { role: 'user', content: prompt },
  ]);

  // Parse JSON — handle potential markdown fences
  const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(jsonStr) as Array<{
    title: string;
    summary: string;
    category: string;
    tags: string[];
  }>;

  return parsed.map((item, i) => {
    const group = groups[i];
    const slug = item.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 80)
      .replace(/-$/, '');

    return {
      slug,
      title: item.title,
      summary: item.summary,
      sources: group.map((g) => ({ name: g.source, url: g.url })),
      category: CATEGORIES.includes(item.category) ? item.category : 'industry',
      tags: item.tags,
      publishedAt: group[0].publishedAt,
      image: null,
    };
  });
}

export async function generateDigest(
  apiKey: string,
  stories: Story[],
  date: string
): Promise<Digest> {
  const storyList = stories
    .slice(0, 8)
    .map((s, i) => `${i + 1}. "${s.title}" (${s.category}): ${s.summary}`)
    .join('\n');

  const system = `You are a senior AI journalist writing a daily news digest. Write an 800-1200 word article synthesizing the day's top AI stories into a coherent narrative. Use markdown headings (##) to organize sections. Be insightful, connect themes across stories, and explain why each development matters. Write in a professional but engaging tone.`;

  const content = await callClaude(apiKey, 'claude-sonnet-4-6', system, [
    { role: 'user', content: `Write the daily AI digest for ${date}. Today's top stories:\n\n${storyList}` },
  ]);

  const formattedDate = new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return {
    date,
    title: `AI News Digest — ${formattedDate}`,
    content,
    topStories: stories.slice(0, 8).map((s) => s.slug),
    publishedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 3: Write worker/src/index.ts**

```typescript
import type { Env, RawItem, SourceConfig, Story } from './types';
import { fetchRss } from './sources/rss';
import { fetchHackerNews } from './sources/hackernews';
import { fetchReddit } from './sources/reddit';
import { deduplicateItems } from './dedup';
import { categorizeAndSummarize, generateDigest } from './synthesize';

const RSS_SOURCES: SourceConfig[] = [
  { id: 'techcrunch', name: 'TechCrunch', feedUrl: 'https://techcrunch.com/category/artificial-intelligence/feed/', type: 'rss' },
  { id: 'theverge', name: 'The Verge', feedUrl: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', type: 'rss' },
  { id: 'arstechnica', name: 'Ars Technica', feedUrl: 'https://feeds.arstechnica.com/arstechnica/technology-lab', type: 'rss' },
  { id: 'wired', name: 'Wired', feedUrl: 'https://www.wired.com/feed/tag/ai/latest/rss', type: 'rss' },
  { id: 'decoder', name: 'The Decoder', feedUrl: 'https://the-decoder.com/feed/', type: 'rss' },
  { id: 'venturebeat', name: 'VentureBeat', feedUrl: 'https://venturebeat.com/category/ai/feed/', type: 'rss' },
  { id: 'mittech', name: 'MIT Tech Review', feedUrl: 'https://www.technologyreview.com/feed/', type: 'rss' },
  { id: 'openai', name: 'OpenAI Blog', feedUrl: 'https://openai.com/blog/rss.xml', type: 'rss' },
  { id: 'anthropic', name: 'Anthropic Blog', feedUrl: 'https://www.anthropic.com/rss.xml', type: 'rss' },
  { id: 'deepmind', name: 'Google DeepMind', feedUrl: 'https://deepmind.google/blog/rss.xml', type: 'rss' },
  { id: 'arxiv', name: 'arXiv cs.AI', feedUrl: 'https://rss.arxiv.org/rss/cs.AI', type: 'rss' },
];

function todayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

function isMidnightRun(): boolean {
  const hour = new Date().getUTCHours();
  return hour === 0;
}

async function fetchAllSources(env: Env): Promise<RawItem[]> {
  const allItems: RawItem[] = [];

  // Fetch RSS sources in parallel
  const rssResults = await Promise.allSettled(
    RSS_SOURCES.map(async (source) => {
      const since = await env.FEED_STATE.get(source.id);
      return fetchRss(source.feedUrl, source.name, since);
    })
  );

  for (const result of rssResults) {
    if (result.status === 'fulfilled') {
      allItems.push(...result.value);
    }
  }

  // Fetch HackerNews
  const hnSince = await env.FEED_STATE.get('hackernews');
  const hnItems = await fetchHackerNews(hnSince);
  allItems.push(...hnItems);

  // Fetch Reddit
  const redditSince = await env.FEED_STATE.get('reddit');
  const redditItems = await fetchReddit(
    env.REDDIT_CLIENT_ID,
    env.REDDIT_CLIENT_SECRET,
    redditSince
  );
  allItems.push(...redditItems);

  return allItems;
}

async function updateFeedState(env: Env): Promise<void> {
  const now = new Date().toISOString();
  const allSourceIds = [...RSS_SOURCES.map((s) => s.id), 'hackernews', 'reddit'];
  await Promise.all(
    allSourceIds.map((id) => env.FEED_STATE.put(id, now))
  );
}

async function triggerGitHubBuild(env: Env): Promise<void> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/build-deploy.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.GITHUB_PAT}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'AIAgenticNews-Worker/1.0',
        },
        body: JSON.stringify({ ref: 'main' }),
      }
    );
    if (!res.ok) {
      console.error(`GitHub dispatch failed: ${res.status} ${await res.text()}`);
    } else {
      console.log('GitHub Actions build triggered');
    }
  } catch (err) {
    console.error('GitHub dispatch error:', err);
  }
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`Cron triggered at ${new Date().toISOString()}`);

    // 1. Fetch all sources
    const rawItems = await fetchAllSources(env);
    console.log(`Fetched ${rawItems.length} raw items`);

    if (rawItems.length === 0) {
      console.log('No new items found, skipping');
      await updateFeedState(env);
      return;
    }

    // 2. Deduplicate
    const groups = deduplicateItems(rawItems);
    console.log(`Deduplicated into ${groups.length} story groups`);

    // 3. Categorize and summarize via Claude
    let stories: Story[];
    try {
      stories = await categorizeAndSummarize(env.ANTHROPIC_API_KEY, groups);
      console.log(`Synthesized ${stories.length} stories`);
    } catch (err) {
      console.error('Synthesis failed:', err);
      await updateFeedState(env);
      return;
    }

    // 4. Write stories to KV
    const today = todayDateString();
    await Promise.all(
      stories.map((story) =>
        env.STORIES.put(`${today}/${story.slug}`, JSON.stringify(story), {
          expirationTtl: 90 * 24 * 60 * 60, // 90 days
        })
      )
    );

    // 5. At midnight, generate daily digest
    if (isMidnightRun()) {
      try {
        // Gather all stories from today for the digest
        const todayStories = stories; // current batch + could fetch more from KV if needed
        const digest = await generateDigest(env.ANTHROPIC_API_KEY, todayStories, today);
        await env.DIGESTS.put(today, JSON.stringify(digest));
        console.log(`Daily digest generated for ${today}`);
      } catch (err) {
        console.error('Digest generation failed:', err);
      }
    }

    // 6. Update feed state
    await updateFeedState(env);

    // 7. Trigger site rebuild
    await triggerGitHubBuild(env);
  },

  // Manual trigger endpoint for testing
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/trigger' && request.method === 'POST') {
      ctx.waitUntil(
        this.scheduled!({} as ScheduledEvent, env, ctx)
      );
      return new Response('Cron triggered manually', { status: 200 });
    }

    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 4: Verify worker compiles**

```bash
cd C:/Users/sunny/projects/aiagentic-news/worker
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/sunny/projects/aiagentic-news
git add -A
git commit -m "feat: Worker dedup, Claude synthesis, cron handler"
```

---

## Task 6: Wire Astro to Read from CF KV

**Files:**
- Modify: `src/lib/kv.ts` (replace dummy data with real KV fetching)
- Modify: `package.json` (add build script that fetches KV)

The Astro site builds statically, so it needs to fetch KV data at build time. We use the Cloudflare REST API to list and read KV keys during `astro build`.

- [ ] **Step 1: Replace src/lib/kv.ts with real KV fetching**

```typescript
import type { Story, Digest } from './types';

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || '';
const CF_API_TOKEN = process.env.CF_API_TOKEN || '';

// KV namespace IDs — set after creating namespaces
const STORIES_NS_ID = process.env.STORIES_NS_ID || '';
const DIGESTS_NS_ID = process.env.DIGESTS_NS_ID || '';

const KV_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces`;

async function kvList(nsId: string, prefix?: string): Promise<{ name: string }[]> {
  if (!CF_API_TOKEN || !nsId) return [];

  const params = new URLSearchParams({ limit: '1000' });
  if (prefix) params.set('prefix', prefix);

  const res = await fetch(`${KV_BASE}/${nsId}/keys?${params}`, {
    headers: { 'Authorization': `Bearer ${CF_API_TOKEN}` },
  });

  if (!res.ok) {
    console.error(`KV list failed: ${res.status}`);
    return [];
  }

  const data = await res.json() as { result: { name: string }[] };
  return data.result || [];
}

async function kvGet<T>(nsId: string, key: string): Promise<T | null> {
  if (!CF_API_TOKEN || !nsId) return null;

  const res = await fetch(`${KV_BASE}/${nsId}/values/${encodeURIComponent(key)}`, {
    headers: { 'Authorization': `Bearer ${CF_API_TOKEN}` },
  });

  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

// --- Dummy data fallback for local dev ---
const DUMMY_STORIES: Story[] = [
  {
    slug: 'openai-gpt5-release',
    title: 'OpenAI Announces GPT-5 with Reasoning Breakthrough',
    summary: 'OpenAI has unveiled GPT-5, featuring a new reasoning architecture that significantly outperforms GPT-4 on complex multi-step tasks.',
    sources: [{ name: 'TechCrunch', url: 'https://example.com/1' }, { name: 'The Verge', url: 'https://example.com/2' }],
    category: 'models',
    tags: ['openai', 'gpt-5', 'llm'],
    publishedAt: '2026-04-03T14:00:00Z',
    image: null,
  },
  {
    slug: 'anthropic-claude-agent-sdk',
    title: 'Anthropic Launches Claude Agent SDK for Autonomous Workflows',
    summary: 'The new Agent SDK enables developers to build multi-step autonomous agents with built-in tool use, memory, and safety guardrails.',
    sources: [{ name: 'Anthropic Blog', url: 'https://example.com/3' }],
    category: 'agents',
    tags: ['anthropic', 'claude', 'agents'],
    publishedAt: '2026-04-03T12:00:00Z',
    image: null,
  },
];

const DUMMY_DIGESTS: Digest[] = [
  {
    date: '2026-04-03',
    title: 'AI News Digest — April 3, 2026',
    content: '## GPT-5 and Agent SDK Dominate the Day\n\nTwo major releases today...',
    topStories: ['openai-gpt5-release', 'anthropic-claude-agent-sdk'],
    publishedAt: '2026-04-04T00:05:00Z',
  },
];

function useDummyData(): boolean {
  return !CF_API_TOKEN || !STORIES_NS_ID;
}

export async function getStories(): Promise<Story[]> {
  if (useDummyData()) return DUMMY_STORIES;

  const keys = await kvList(STORIES_NS_ID);
  const stories = await Promise.all(
    keys.map((k) => kvGet<Story>(STORIES_NS_ID, k.name))
  );

  return stories
    .filter((s): s is Story => s !== null)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

export async function getStoriesByCategory(category: string): Promise<Story[]> {
  const stories = await getStories();
  return stories.filter((s) => s.category === category);
}

export async function getStoryBySlug(slug: string): Promise<Story | undefined> {
  const stories = await getStories();
  return stories.find((s) => s.slug === slug);
}

export async function getDigests(): Promise<Digest[]> {
  if (useDummyData()) return DUMMY_DIGESTS;

  const keys = await kvList(DIGESTS_NS_ID);
  const digests = await Promise.all(
    keys.map((k) => kvGet<Digest>(DIGESTS_NS_ID, k.name))
  );

  return digests
    .filter((d): d is Digest => d !== null)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

export async function getDigestByDate(date: string): Promise<Digest | undefined> {
  if (useDummyData()) return DUMMY_DIGESTS.find((d) => d.date === date);

  return kvGet<Digest>(DIGESTS_NS_ID, date) ?? undefined;
}

export async function getAllStorySlugs(): Promise<string[]> {
  const stories = await getStories();
  return stories.map((s) => s.slug);
}

export async function getAllDigestDates(): Promise<string[]> {
  const digests = await getDigests();
  return digests.map((d) => d.date);
}
```

- [ ] **Step 2: Verify build works with dummy data**

```bash
cd C:/Users/sunny/projects/aiagentic-news
npx astro build
```

Expected: builds successfully using dummy data fallback.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/sunny/projects/aiagentic-news
git add -A
git commit -m "feat: wire KV data layer with REST API + dummy fallback"
```

---

## Task 7: GitHub Actions Pipeline

**Files:**
- Create: `.github/workflows/build-deploy.yml`

- [ ] **Step 1: Write .github/workflows/build-deploy.yml**

```yaml
name: Build and Deploy

on:
  workflow_dispatch:
  schedule:
    - cron: '0 1 * * *'  # Daily fallback at 01:00 UTC

jobs:
  build-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build Astro site
        env:
          CF_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          STORIES_NS_ID: ${{ secrets.STORIES_NS_ID }}
          DIGESTS_NS_ID: ${{ secrets.DIGESTS_NS_ID }}
        run: npm run build

      - name: Deploy to CF Pages
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
        run: npx wrangler pages deploy dist --project-name aiagentic-news --commit-dirty=true
```

- [ ] **Step 2: Commit**

```bash
cd C:/Users/sunny/projects/aiagentic-news
git add -A
git commit -m "feat: GitHub Actions build and deploy pipeline"
```

---

## Task 8: Create GitHub Repo, KV Namespaces, and Deploy

**Files:**
- Modify: `worker/wrangler.toml` (fill in real KV namespace IDs)

- [ ] **Step 1: Create GitHub repo**

```bash
cd C:/Users/sunny/projects/aiagentic-news
gh repo create sunnyp81/aiagentic-news --public --source=. --remote=origin --push
```

- [ ] **Step 2: Create CF KV namespaces**

```bash
cd C:/Users/sunny/projects/aiagentic-news/worker
npx wrangler kv namespace create STORIES
npx wrangler kv namespace create DIGESTS
npx wrangler kv namespace create FEED_STATE
```

Copy the IDs from the output and update `worker/wrangler.toml`.

- [ ] **Step 3: Update worker/wrangler.toml with real KV IDs**

Replace the `REPLACE_AFTER_CREATE` values with the actual IDs from step 2.

- [ ] **Step 4: Set Worker secrets**

```bash
cd C:/Users/sunny/projects/aiagentic-news/worker
echo "YOUR_ANTHROPIC_KEY" | npx wrangler secret put ANTHROPIC_API_KEY
echo "$GITHUB_PAT" | npx wrangler secret put GITHUB_PAT
```

- [ ] **Step 5: Deploy Worker**

```bash
cd C:/Users/sunny/projects/aiagentic-news/worker
npx wrangler deploy
```

- [ ] **Step 6: Create CF Pages project**

```bash
cd C:/Users/sunny/projects/aiagentic-news
CLOUDFLARE_API_TOKEN=$CF_API_TOKEN npx wrangler pages project create aiagentic-news --production-branch=main
```

- [ ] **Step 7: Set GitHub Actions secrets**

```bash
cd C:/Users/sunny/projects/aiagentic-news
gh secret set CF_API_TOKEN --body "$CF_API_TOKEN"
gh secret set CF_ACCOUNT_ID --body "$CF_ACCOUNT_ID"
gh secret set STORIES_NS_ID --body "PASTE_STORIES_KV_ID"
gh secret set DIGESTS_NS_ID --body "PASTE_DIGESTS_KV_ID"
```

- [ ] **Step 8: Build and deploy site**

```bash
cd C:/Users/sunny/projects/aiagentic-news
npm run deploy
```

- [ ] **Step 9: Connect aiagentic.news domain in CF dashboard**

CF Dashboard → Pages → aiagentic-news → Custom domains → Add `aiagentic.news`.

- [ ] **Step 10: Trigger Worker manually to populate KV**

```bash
curl -X POST https://aiagentic-news-worker.<your-subdomain>.workers.dev/trigger
```

- [ ] **Step 11: Trigger rebuild after KV is populated**

```bash
cd C:/Users/sunny/projects/aiagentic-news
gh workflow run build-deploy.yml
```

- [ ] **Step 12: Commit final changes and push**

```bash
cd C:/Users/sunny/projects/aiagentic-news
git add -A
git commit -m "feat: deploy config — KV namespaces, secrets, CF Pages"
git push
```

---

## Verification Checklist

- [ ] Worker deploys without errors (`wrangler deploy`)
- [ ] Manual trigger endpoint works (`POST /trigger`)
- [ ] KV is populated with stories after trigger
- [ ] `astro build` reads from KV and generates pages
- [ ] Site deploys to CF Pages and loads at aiagentic.news
- [ ] GitHub Actions workflow runs on `workflow_dispatch`
- [ ] Cron schedule fires every 4 hours (check CF dashboard logs)
- [ ] Daily digest is generated at midnight UTC
- [ ] All page types render correctly: `/`, `/story/*`, `/digest/*`, `/category/*`, `/about/`
- [ ] Mobile responsive layout works
- [ ] Schema markup present on story and digest pages
- [ ] Sitemap generated at `/sitemap-index.xml`
