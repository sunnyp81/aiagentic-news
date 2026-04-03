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
