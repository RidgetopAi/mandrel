/**
 * Shared task-search predicate.
 *
 * Used by BOTH the Card View (TaskCardList) and the Table View (TaskList) so the
 * two client-side filters are a single source of truth and can never drift.
 *
 * A task matches when the (case-insensitive, trimmed) search term is a substring
 * of any of:
 *   - the task id — this matches the 8-char short id prefix (e.g. `95b59944`)
 *     AND the full UUID, since `includes` is a substring test;
 *   - the title;
 *   - the description (optional); or
 *   - any tag.
 *
 * An empty/whitespace-only term matches everything (no-op filter).
 */

export interface SearchableTask {
  id: string;
  title: string;
  description?: string;
  tags: string[];
}

export function taskMatchesSearch(task: SearchableTask, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) {
    return true;
  }

  return (
    task.id.toLowerCase().includes(q) ||
    task.title.toLowerCase().includes(q) ||
    (task.description?.toLowerCase().includes(q) ?? false) ||
    task.tags.some(tag => tag.toLowerCase().includes(q))
  );
}
