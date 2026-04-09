import rss from '@astrojs/rss';
import { getStories } from '../lib/kv';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const stories = await getStories();

  return rss({
    title: 'AI Agentic News',
    description: 'The latest agentic AI news — curated from 13+ sources, synthesized every 4 hours.',
    site: context.site!,
    items: stories.slice(0, 50).map((story) => ({
      title: story.title,
      description: story.summary,
      link: `/story/${story.slug}/`,
      pubDate: new Date(story.publishedAt),
      categories: [story.category, ...story.tags],
    })),
    customData: `<language>en-gb</language><ttl>240</ttl>`,
  });
}
