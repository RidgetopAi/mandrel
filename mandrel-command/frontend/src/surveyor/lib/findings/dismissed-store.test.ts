import {
  loadDismissed,
  saveDismissed,
  withDismissed,
  withoutDismissed,
  type StorageLike,
} from './dismissed-store';

/** In-memory StorageLike for deterministic, DOM-free tests. */
function fakeStorage(initial: Record<string, string> = {}): StorageLike & {
  dump: () => Record<string, string>;
} {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    dump: () => Object.fromEntries(map),
  };
}

const KEY = 'test.dismissed';

describe('dismissed-store persistence', () => {
  it('returns an empty set when nothing is stored', () => {
    expect(loadDismissed(fakeStorage(), KEY).size).toBe(0);
  });

  it('round-trips a set through save/load', () => {
    const s = fakeStorage();
    const ids = new Set(['knip|unused_export|file:a', 'surveyor|large_file|file:c']);
    saveDismissed(s, ids, KEY);
    const loaded = loadDismissed(s, KEY);
    expect(loaded).toEqual(ids);
  });

  it('persists across a fresh storage instance seeded with the same backing data', () => {
    const s = fakeStorage();
    saveDismissed(s, new Set(['k|c|file:a']), KEY);
    const persisted = s.dump();
    // Simulate reload: brand-new storage object, same underlying bytes.
    const reloaded = loadDismissed(fakeStorage(persisted), KEY);
    expect(reloaded.has('k|c|file:a')).toBe(true);
  });

  it('tolerates corrupt / non-array JSON', () => {
    expect(loadDismissed(fakeStorage({ [KEY]: 'not json' }), KEY).size).toBe(0);
    expect(loadDismissed(fakeStorage({ [KEY]: '{"a":1}' }), KEY).size).toBe(0);
    expect(loadDismissed(fakeStorage({ [KEY]: '[1,2,3]' }), KEY).size).toBe(0);
  });

  it('serializes deterministically (sorted)', () => {
    const s = fakeStorage();
    saveDismissed(s, new Set(['c', 'a', 'b']), KEY);
    expect(s.dump()[KEY]).toBe('["a","b","c"]');
  });
});

describe('dismissed-store pure set ops', () => {
  it('withDismissed adds without mutating the input', () => {
    const base = new Set(['a']);
    const next = withDismissed(base, 'b');
    expect([...next].sort()).toEqual(['a', 'b']);
    expect(base.has('b')).toBe(false);
  });

  it('withoutDismissed removes without mutating the input', () => {
    const base = new Set(['a', 'b']);
    const next = withoutDismissed(base, 'b');
    expect([...next]).toEqual(['a']);
    expect(base.has('b')).toBe(true);
  });
});
