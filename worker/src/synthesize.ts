import type { RawItem, Story, Digest } from './types';

const CATEGORIES = ['models', 'agents', 'industry', 'tools', 'policy', 'hardware'] as const;

async function runAI(ai: Ai, prompt: string, system: string, maxTokens = 1200): Promise<string> {
  const response = await ai.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    max_tokens: maxTokens,
  });

  return (response as { response: string }).response;
}

/** Process one story group → one Story. Returns null if AI fails. */
async function synthesizeOne(
  ai: Ai,
  group: RawItem[],
  index: number
): Promise<Story | null> {
  const titles = group.map((item) => `- "${item.title}" (${item.source})`).join('\n');
  const context = group.map((item) => item.summary).filter(Boolean).join(' ').slice(0, 600);

  const system = `You are a tech journalist. Output a single JSON object (no array, no markdown fences) with:
- "title": specific headline in Title Case, max 80 chars, include company/model names
- "summary": 2-3 sentences, name who, what, why it matters
- "content": article body, 3-4 prose paragraphs separated by \\n\\n, 200-300 words total, NO markdown headers or bullet points
- "key_takeaways": array of 3 short factual bullet strings
- "category": one of ["models","agents","industry","tools","policy","hardware"]
- "tags": array of 3-4 lowercase strings
Output ONLY valid JSON. No extra text.`;

  const prompt = `Titles:\n${titles}\nContext: ${context}`;

  let raw: string;
  try {
    raw = await runAI(ai, prompt, system, 900);
  } catch (err) {
    console.error(`Story ${index + 1} AI call failed:`, err);
    return null;
  }

  // Strip markdown fences if present
  const jsonStr = raw
    .replace(/```json?\n?/g, '')
    .replace(/```/g, '')
    .trim();

  // Extract first {...} block
  const match = jsonStr.match(/\{[\s\S]*\}/);
  if (!match) {
    console.error(`Story ${index + 1}: no JSON object found in AI response`);
    return null;
  }

  let parsed: { title: string; summary: string; content?: string; key_takeaways?: string[]; category: string; tags: string[] };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    console.error(`Story ${index + 1}: JSON parse failed`);
    return null;
  }

  if (!parsed.title || !parsed.summary) {
    console.error(`Story ${index + 1}: missing required fields`);
    return null;
  }

  const slug = parsed.title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80)
    .replace(/-$/, '');

  const category = CATEGORIES.includes(parsed.category as typeof CATEGORIES[number])
    ? parsed.category
    : 'industry';

  return {
    slug,
    title: parsed.title,
    summary: parsed.summary,
    content: parsed.content || parsed.summary,
    keyTakeaways: parsed.key_takeaways || [],
    sources: group.map((g) => ({ name: g.source, url: g.url })),
    category,
    tags: parsed.tags || [],
    publishedAt: group[0].publishedAt,
    image: null,
  };
}

export async function categorizeAndSummarize(
  ai: Ai,
  groups: RawItem[][]
): Promise<Story[]> {
  // Process top 8 groups, one at a time to avoid token truncation
  const topGroups = groups.slice(0, 8);
  const allStories: Story[] = [];

  for (let i = 0; i < topGroups.length; i++) {
    const story = await synthesizeOne(ai, topGroups[i], i);
    if (story) {
      allStories.push(story);
      console.log(`Story ${i + 1}/${topGroups.length}: "${story.title}" [${story.category}]`);
    }
  }

  console.log(`Synthesized ${allStories.length}/${topGroups.length} stories`);
  return allStories;
}

export async function generateDigest(
  ai: Ai,
  stories: Story[],
  date: string
): Promise<Digest> {
  const storyList = stories
    .slice(0, 6)
    .map((s, i) => `${i + 1}. "${s.title}" (${s.category}): ${s.summary}`)
    .join('\n');

  const system = `You are an AI journalist writing a daily digest. Write 600-800 words as prose paragraphs only — NO markdown headers, NO bullet points. Synthesize the top AI stories, connect themes, explain why each matters. Plain text only.`;

  const content = await runAI(
    ai,
    `Write the daily AI digest for ${date}. Top stories:\n\n${storyList}`,
    system,
    1400,
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
    topStories: stories.slice(0, 6).map((s) => s.slug),
    publishedAt: new Date().toISOString(),
  };
}
