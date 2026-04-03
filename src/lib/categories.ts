import type { CategoryId } from './types';

export interface Category {
  id: CategoryId;
  label: string;
  color: string;
}

export const categories: Category[] = [
  { id: 'models', label: 'Models & Research', color: 'var(--color-cat-models)' },
  { id: 'agents', label: 'Agents & Autonomy', color: 'var(--color-cat-agents)' },
  { id: 'industry', label: 'Industry & Business', color: 'var(--color-cat-industry)' },
  { id: 'tools', label: 'Tools & Frameworks', color: 'var(--color-cat-tools)' },
  { id: 'policy', label: 'Policy & Ethics', color: 'var(--color-cat-policy)' },
  { id: 'hardware', label: 'Hardware & Infrastructure', color: 'var(--color-cat-hardware)' },
];

export function getCategoryById(id: CategoryId): Category {
  return categories.find((c) => c.id === id)!;
}
