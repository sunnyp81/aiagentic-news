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
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
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

    // 5. At midnight, generate daily digest
    if (isMidnightRun()) {
      try {
        const digest = await generateDigest(env.AI, stories, today);
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
        this.scheduled!({} as ScheduledController, env, ctx) as Promise<void>
      );
      return new Response('Cron triggered manually', { status: 200 });
    }

    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
