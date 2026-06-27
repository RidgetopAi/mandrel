import { taskMatchesSearch, SearchableTask } from './taskSearch';

const baseTask: SearchableTask = {
  id: '95b59944-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
  title: 'Wire up the deploy gate',
  description: 'Add an origin-ref pre-flight check before the customer roll',
  tags: ['deploy', 'ci', 'gate'],
};

describe('taskMatchesSearch', () => {
  it('matches by the 8-char short id prefix', () => {
    expect(taskMatchesSearch(baseTask, '95b59944')).toBe(true);
  });

  it('matches by the full UUID', () => {
    expect(
      taskMatchesSearch(baseTask, '95b59944-1c2d-4e5f-8a9b-0c1d2e3f4a5b')
    ).toBe(true);
  });

  it('matches by an interior substring of the UUID', () => {
    expect(taskMatchesSearch(baseTask, '4e5f')).toBe(true);
  });

  it('matches by title (case-insensitive)', () => {
    expect(taskMatchesSearch(baseTask, 'DEPLOY GATE')).toBe(true);
  });

  it('matches by description', () => {
    expect(taskMatchesSearch(baseTask, 'origin-ref')).toBe(true);
  });

  it('matches by a tag', () => {
    expect(taskMatchesSearch(baseTask, 'ci')).toBe(true);
  });

  it('returns false for a non-matching term', () => {
    expect(taskMatchesSearch(baseTask, 'nonexistent-zzz')).toBe(false);
  });

  it('treats an empty / whitespace term as match-all', () => {
    expect(taskMatchesSearch(baseTask, '')).toBe(true);
    expect(taskMatchesSearch(baseTask, '   ')).toBe(true);
  });

  it('handles a task with no description (optional field)', () => {
    const noDesc: SearchableTask = { ...baseTask, description: undefined };
    expect(taskMatchesSearch(noDesc, 'origin-ref')).toBe(false);
    expect(taskMatchesSearch(noDesc, '95b59944')).toBe(true);
  });
});
