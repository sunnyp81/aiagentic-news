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

    // Title: handle CDATA and plain text
    const title =
      block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1] ||
      block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ||
      '';

    // Link: handle <link>url</link> and text after self-closing <link/>
    let link =
      block.match(/<link>(https?:\/\/[^<]+)<\/link>/)?.[1] ||
      block.match(/<link\s*\/>\s*(https?:\/\/\S+)/)?.[1] ||
      block.match(/<link\s+href="([^"]+)"/)?.[1] ||
      '';
    // Some RSS feeds put the link as bare text between <link></link> with whitespace
    if (!link) {
      const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
      if (linkMatch && linkMatch[1].trim().startsWith('http')) {
        link = linkMatch[1].trim();
      }
    }

    const description =
      block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] ||
      block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ||
      '';

    const pubDate =
      block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ||
      block.match(/<dc:date>(.*?)<\/dc:date>/)?.[1] ||
      '';

    if (title.trim() && link.trim()) {
      items.push({
        title: title.trim(),
        link: link.trim(),
        description: description.trim(),
        pubDate: pubDate.trim(),
      });
    }
  }

  // Handle Atom feeds (<entry> with <link href="...">)
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || '';
    const link =
      block.match(/<link[^>]+rel="alternate"[^>]+href="([^"]+)"/)?.[1] ||
      block.match(/<link[^>]+href="([^"]+)"/)?.[1] ||
      '';
    const summary = block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1] || '';
    const published =
      block.match(/<published>(.*?)<\/published>/)?.[1] ||
      block.match(/<updated>(.*?)<\/updated>/)?.[1] ||
      '';

    if (title.trim() && link.trim()) {
      items.push({
        title: title.trim(),
        link: link.trim(),
        description: summary.trim(),
        pubDate: published.trim(),
      });
    }
  }

  return items;
}

export async function fetchRss(
  feedUrl: string,
  sourceName: string,
  since: string | null
): Promise<RawItem[]> {
  // First run (no since): go back 7 days. Subsequent: use last poll time.
  const sinceDate = since
    ? new Date(since)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

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
    console.log(`${sourceName}: parsed ${items.length} items from feed`);

    const filtered = items
      .filter((item) => {
        if (!item.pubDate) return true;
        const d = new Date(item.pubDate);
        if (isNaN(d.getTime())) return true; // unparseable date — include anyway
        return d > sinceDate;
      })
      .map((item) => ({
        title: item.title,
        url: item.link,
        source: sourceName,
        summary: item.description?.replace(/<[^>]*>/g, '').slice(0, 300) || '',
        publishedAt: item.pubDate
          ? new Date(item.pubDate).toISOString()
          : new Date().toISOString(),
      }));

    console.log(`${sourceName}: ${filtered.length} items after date filter`);
    return filtered;
  } catch (err) {
    console.error(`RSS error for ${sourceName}:`, err);
    return [];
  }
}
