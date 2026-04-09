export interface Story {
  slug: string;
  title: string;
  summary: string;
  content: string;
  keyTakeaways?: string[];
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
