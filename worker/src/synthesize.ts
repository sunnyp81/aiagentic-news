import type { RawItem, Story, Digest } from './types';

async function runAI(ai: Ai, prompt: string, system: string): Promise<string> {
  const response = await ai.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    max_tokens: 4096,
  });

  return (response as { response: string }).response;
}

export async function categorizeAndSummarize(
  ai: Ai,
  groups: RawItem[][]
): Promise<Story[]> {
  const CATEGORIES = ['models', 'agents', 'industry', 'tools', 'policy', 'hardware'];

  // Limit to top 30 groups to stay within context window
  const topGroups = groups.slice(0, 30);

  // Process in batches of 10 to avoid context limit
  const BATCH_SIZE = 10;
  const allStories: Story[] = [];

  for (let i = 0; i < topGroups.length; i += BATCH_SIZE) {
    const batch = topGroups.slice(i, i + BATCH_SIZE);

    const prompt = batch.map((group, j) => {
      const titles = group.map((item) => `- "${item.title}" (${item.source})`).join('\n');
      const summaries = group.map((item) => item.summary).filter(Boolean).join(' ');
      return `Story ${j + 1}:\nTitles:\n${titles}\nContext: ${summaries.slice(0, 300)}`;
    }).join('\n\n---\n\n');

    const system = `You are a news editor for an AI news site. For each story group, output a JSON array with one object per story containing:
- "title": a clear, engaging headline (not copied from any source)
- "summary": 2-3 sentence synthesis of the story
- "category": one of ${JSON.stringify(CATEGORIES)}
- "tags": 2-5 lowercase tags

Output ONLY valid JSON array, no markdown fences, no extra text.`;

    let raw: string;
    try {
      raw = await runAI(ai, prompt, system);
    } catch (err) {
      console.error(`Batch ${i / BATCH_SIZE + 1} synthesis failed:`, err);
      continue;
    }

    const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();

    let parsed: Array<{ title: string; summary: string; category: string; tags: string[] }>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      const match = jsonStr.match(/\[[\s\S]*\]/);
      if (!match) {
        console.error(`Batch ${i / BATCH_SIZE + 1} JSON parse failed`);
        continue;
      }
      parsed = JSON.parse(match[0]);
    }

    const stories = parsed.map((item, j) => {
      const group = batch[j] || batch[batch.length - 1];
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
        tags: item.tags || [],
        publishedAt: group[0].publishedAt,
        image: null,
      };
    });

    allStories.push(...stories);
    console.log(`Batch ${i / BATCH_SIZE + 1}: synthesized ${stories.length} stories`);
  }

  return allStories;
}

export async function generateDigest(
  ai: Ai,
  stories: Story[],
  date: string
): Promise<Digest> {
  const storyList = stories
    .slice(0, 8)
    .map((s, i) => `${i + 1}. "${s.title}" (${s.category}): ${s.summary}`)
    .join('\n');

  const system = `You are a senior AI journalist writing a daily news digest. Write an 800-1200 word article synthesizing the day's top AI stories into a coherent narrative. Use markdown headings (##) to organize sections. Be insightful, connect themes across stories, and explain why each development matters. Write in a professional but engaging tone.`;

  const content = await runAI(
    ai,
    `Write the daily AI digest for ${date}. Today's top stories:\n\n${storyList}`,
    system
  );

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
