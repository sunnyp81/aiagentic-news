import type { RawItem } from './types';

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a: string, b: string): number {
  const wordsA = new Set(normalizeTitle(a).split(' '));
  const wordsB = new Set(normalizeTitle(b).split(' '));
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.size / union.size; // Jaccard similarity
}

export function deduplicateItems(items: RawItem[]): RawItem[][] {
  const groups: RawItem[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;

    const group: RawItem[] = [items[i]];
    used.add(i);

    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j)) continue;

      // Same URL = definite duplicate
      if (items[i].url === items[j].url) {
        group.push(items[j]);
        used.add(j);
        continue;
      }

      // Fuzzy title match — threshold 0.6
      if (similarity(items[i].title, items[j].title) > 0.6) {
        group.push(items[j]);
        used.add(j);
      }
    }

    groups.push(group);
  }

  return groups;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
    .replace(/-$/, '');
}
