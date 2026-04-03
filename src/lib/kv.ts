import type { Story, Digest } from './types';

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || '';
const CF_API_KEY = process.env.CF_API_KEY || '';
const CF_EMAIL = process.env.CF_EMAIL || '';

// KV namespace IDs — set after creating namespaces
const STORIES_NS_ID = process.env.STORIES_NS_ID || '';
const DIGESTS_NS_ID = process.env.DIGESTS_NS_ID || '';

const KV_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces`;

function cfHeaders(): Record<string, string> {
  return {
    'X-Auth-Key': CF_API_KEY,
    'X-Auth-Email': CF_EMAIL,
  };
}

async function kvList(nsId: string, prefix?: string): Promise<{ name: string }[]> {
  if (!CF_API_KEY || !nsId) return [];

  const params = new URLSearchParams({ limit: '1000' });
  if (prefix) params.set('prefix', prefix);

  const res = await fetch(`${KV_BASE}/${nsId}/keys?${params}`, {
    headers: cfHeaders(),
  });

  if (!res.ok) {
    console.error(`KV list failed: ${res.status}`);
    return [];
  }

  const data = await res.json() as { result: { name: string }[] };
  return data.result || [];
}

async function kvGet<T>(nsId: string, key: string): Promise<T | null> {
  if (!CF_API_KEY || !nsId) return null;

  const res = await fetch(`${KV_BASE}/${nsId}/values/${encodeURIComponent(key)}`, {
    headers: cfHeaders(),
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
    content: '## A New Era of Reasoning\n\nOpenAI has officially released GPT-5, marking what many in the industry consider the most significant leap in language model capabilities since GPT-4. The new model introduces a fundamentally redesigned reasoning architecture that enables multi-step logical deduction.\n\n**Key improvements:**\n- 3x better performance on complex reasoning benchmarks\n- Native tool use without fine-tuning\n- 200K context window as standard\n\n## Why It Matters\n\nGPT-5 represents a shift from pattern matching to genuine reasoning chains. Early testers report the model can solve problems that previously required specialized systems.',
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
    content: '## Building Agents Just Got Easier\n\nAnthropic has released the Claude Agent SDK, a comprehensive toolkit for building autonomous AI agents. The SDK provides built-in primitives for tool use, persistent memory, and safety guardrails.\n\n**What the SDK includes:**\n- Multi-step task orchestration\n- Built-in tool calling with 20+ integrations\n- Conversation memory across sessions\n- Safety boundaries and approval workflows\n\n## Early Adoption\n\nEarly adopters report 3x productivity gains in customer support automation, with agents handling complex multi-turn conversations without human intervention.',
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
  return !CF_API_KEY || !CF_ACCOUNT_ID || !STORIES_NS_ID;
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
