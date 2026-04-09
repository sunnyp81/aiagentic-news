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
  { id: 'anthropic', name: 'Anthropic Blog', feedUrl: 'https://www.anthropic.com/feed.xml', type: 'rss' },
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

async function pushIndexNow(slugs: string[], env: Env): Promise<void> {
  const key = env.INDEXNOW_KEY || 'fd0147cf4f4446f4984568ee673533e6';
  const host = 'aiagentic.news';
  const urlList = slugs.map((slug) => `https://${host}/story/${slug}/`);

  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host,
        key,
        keyLocation: `https://${host}/${key}.txt`,
        urlList,
      }),
    });
    if (res.ok) {
      console.log(`IndexNow: submitted ${urlList.length} URLs (status ${res.status})`);
    } else {
      console.error(`IndexNow failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error('IndexNow error:', err);
  }
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
        body: JSON.stringify({ ref: 'master' }),
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

async function runPipeline(env: Env): Promise<void> {
    console.log(`Pipeline started at ${new Date().toISOString()}`);

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

    // 3. Categorize and summarize via Workers AI
    let stories: Story[];
    try {
      stories = await categorizeAndSummarize(env.AI, groups);
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

    // 5. Push new story URLs to IndexNow (Bing)
    await pushIndexNow(stories.map((s) => s.slug), env);

    // 6. At midnight, generate daily digest
    if (isMidnightRun()) {
      try {
        const digest = await generateDigest(env.AI, stories, today);
        await env.DIGESTS.put(today, JSON.stringify(digest));
        console.log(`Daily digest generated for ${today}`);
      } catch (err) {
        console.error('Digest generation failed:', err);
      }
    }

    // 7. Update feed state
    await updateFeedState(env);

    // 8. Trigger site rebuild
    await triggerGitHubBuild(env);
}

function generateOgSvg(title: string, category: string): string {
  const CATEGORY_COLORS: Record<string, string> = {
    models: '#8b5cf6',
    agents: '#06b6d4',
    industry: '#f59e0b',
    tools: '#10b981',
    policy: '#ef4444',
    hardware: '#f97316',
  };
  const catColor = CATEGORY_COLORS[category] || '#8b5cf6';

  // Wrap title to max 2 lines of ~38 chars
  const words = title.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (lines.length >= 2) break;
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= 38) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current && lines.length < 2) {
    // Truncate if still too long
    lines.push(current.length > 40 ? current.slice(0, 38) + '…' : current);
  }
  if (lines.length === 0) lines.push(title.slice(0, 38));

  const titleY1 = lines.length === 2 ? 330 : 360;
  const titleY2 = titleY1 + 80;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#060911"/>
      <stop offset="100%" stop-color="#0d0f1a"/>
    </linearGradient>
    <radialGradient id="glow" cx="15%" cy="30%" r="50%">
      <stop offset="0%" stop-color="${catColor}" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="${catColor}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${catColor}"/>
      <stop offset="100%" stop-color="#a78bfa"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <!-- Grid lines -->
  <g stroke="#ffffff" stroke-opacity="0.03" stroke-width="1">
    <line x1="0" y1="105" x2="1200" y2="105"/>
    <line x1="0" y1="210" x2="1200" y2="210"/>
    <line x1="0" y1="315" x2="1200" y2="315"/>
    <line x1="0" y1="420" x2="1200" y2="420"/>
    <line x1="0" y1="525" x2="1200" y2="525"/>
    <line x1="240" y1="0" x2="240" y2="630"/>
    <line x1="480" y1="0" x2="480" y2="630"/>
    <line x1="720" y1="0" x2="720" y2="630"/>
    <line x1="960" y1="0" x2="960" y2="630"/>
  </g>

  <!-- Accent bar top -->
  <rect x="0" y="0" width="1200" height="4" fill="url(#accent)"/>

  <!-- Site label -->
  <text x="60" y="90" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff" opacity="0.5" letter-spacing="4">AIAGENTIC.NEWS</text>

  <!-- Live dot -->
  <circle cx="1120" cy="76" r="8" fill="#10b981"/>
  <text x="1136" y="82" font-family="Arial, sans-serif" font-size="20" fill="#10b981" font-weight="600">LIVE</text>

  <!-- Category chip -->
  <rect x="60" y="${titleY1 - 68}" width="${category.length * 13 + 32}" height="36" rx="6" fill="${catColor}" opacity="0.2"/>
  <rect x="60" y="${titleY1 - 68}" width="${category.length * 13 + 32}" height="36" rx="6" fill="none" stroke="${catColor}" stroke-width="1" opacity="0.6"/>
  <text x="${76}" y="${titleY1 - 44}" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="${catColor}" letter-spacing="2">${category.toUpperCase()}</text>

  <!-- Title line 1 -->
  <text x="60" y="${titleY1}" font-family="Arial, sans-serif" font-size="64" font-weight="900" fill="#ffffff" opacity="0.95">${lines[0] || ''}</text>
  ${lines[1] ? `<text x="60" y="${titleY2}" font-family="Arial, sans-serif" font-size="64" font-weight="900" fill="#ffffff" opacity="0.95">${lines[1]}</text>` : ''}

  <!-- Bottom bar -->
  <rect x="0" y="574" width="1200" height="56" fill="#ffffff" fill-opacity="0.03"/>
  <text x="60" y="609" font-family="Arial, sans-serif" font-size="20" fill="#ffffff" opacity="0.4">Curated from 13+ sources · Updated every 4 hours · Powered by AI</text>

  <!-- Decorative circles -->
  <circle cx="1100" cy="500" r="180" fill="${catColor}" fill-opacity="0.04"/>
  <circle cx="1100" cy="500" r="120" fill="${catColor}" fill-opacity="0.04"/>
</svg>`;
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await runPipeline(env);
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/og') {
      const title = url.searchParams.get('title') || 'AI Agentic News';
      const category = url.searchParams.get('category') || 'industry';
      const svg = generateOgSvg(title, category);
      return new Response(svg, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    if (url.pathname === '/trigger' && request.method === 'POST') {
      // Pipeline runs via waitUntil — returns immediately.
      // For full 15-min execution, use the cron trigger.
      ctx.waitUntil(runPipeline(env).catch(err => console.error('Pipeline error:', err)));
      return new Response('Pipeline triggered via waitUntil', { status: 200 });
    }

    if (url.pathname === '/test-write') {
      await env.STORIES.put('test/hello', JSON.stringify({ title: 'Test story', slug: 'hello' }));
      const val = await env.STORIES.get('test/hello');
      return new Response(`Write test: ${val ? 'SUCCESS' : 'FAILED'}`, { status: 200 });
    }

    if (url.pathname === '/test-ai') {
      try {
        const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
          messages: [{ role: 'user', content: 'Say hello in 10 words' }],
          max_tokens: 50,
        });
        return new Response(`AI test: ${JSON.stringify(response)}`, { status: 200 });
      } catch (err) {
        return new Response(`AI error: ${err}`, { status: 500 });
      }
    }

    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
