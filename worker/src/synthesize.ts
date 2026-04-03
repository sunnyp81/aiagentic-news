import type { RawItem, Story, Digest } from './types';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  content: { type: string; text: string }[];
}

async function callClaude(
  apiKey: string,
  model: string,
  system: string,
  messages: ClaudeMessage[]
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data: ClaudeResponse = await res.json();
  return data.content[0].text;
}

export async function categorizeAndSummarize(
  apiKey: string,
  groups: RawItem[][]
): Promise<Story[]> {
  const CATEGORIES = ['models', 'agents', 'industry', 'tools', 'policy', 'hardware'];

  // Batch all groups into one API call for efficiency
  const prompt = groups.map((group, i) => {
    const titles = group.map((item) => `- "${item.title}" (${item.source})`).join('\n');
    const summaries = group.map((item) => item.summary).filter(Boolean).join(' ');
    return `Story ${i + 1}:\nTitles:\n${titles}\nContext: ${summaries.slice(0, 500)}`;
  }).join('\n\n---\n\n');

  const system = `You are a news editor for an AI news site. For each story group, output a JSON array with one object per story containing:
- "title": a clear, engaging headline (not copied from any source)
- "summary": 2-3 sentence synthesis of the story
- "category": one of ${JSON.stringify(CATEGORIES)}
- "tags": 2-5 lowercase tags

Output ONLY valid JSON array, no markdown fences.`;

  const raw = await callClaude(apiKey, 'claude-haiku-4-5-20251001', system, [
    { role: 'user', content: prompt },
  ]);

  // Parse JSON — handle potential markdown fences
  const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(jsonStr) as Array<{
    title: string;
    summary: string;
    category: string;
    tags: string[];
  }>;

  return parsed.map((item, i) => {
    const group = groups[i];
    const slug = item.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 80)
      .replace(/-$/, '');

    return {
      slug,
      title: item.title,
      summary: item.summary,
      sources: group.map((g) => ({ name: g.source, url: g.url })),
      category: CATEGORIES.includes(item.category) ? item.category : 'industry',
      tags: item.tags,
      publishedAt: group[0].publishedAt,
      image: null,
    };
  });
}

export async function generateDigest(
  apiKey: string,
  stories: Story[],
  date: string
): Promise<Digest> {
  const storyList = stories
    .slice(0, 8)
    .map((s, i) => `${i + 1}. "${s.title}" (${s.category}): ${s.summary}`)
    .join('\n');

  const system = `You are a senior AI journalist writing a daily news digest. Write an 800-1200 word article synthesizing the day's top AI stories into a coherent narrative. Use markdown headings (##) to organize sections. Be insightful, connect themes across stories, and explain why each development matters. Write in a professional but engaging tone.`;

  const content = await callClaude(apiKey, 'claude-sonnet-4-6', system, [
    { role: 'user', content: `Write the daily AI digest for ${date}. Today's top stories:\n\n${storyList}` },
  ]);

  const formattedDate = new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return {
    date,
    title: `AI News Digest — ${formattedDate}`,
    content,
    topStories: stories.slice(0, 8).map((s) => s.slug),
    publishedAt: new Date().toISOString(),
  };
}
