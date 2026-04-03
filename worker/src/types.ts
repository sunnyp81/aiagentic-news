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
  content: string;
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
  AI: Ai;
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
