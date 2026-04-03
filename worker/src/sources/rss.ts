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
