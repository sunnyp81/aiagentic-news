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
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

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
