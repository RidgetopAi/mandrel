/**
 * Named-ref chip predicate test (Command UI).
 *
 * Pins the EXACT decision the ContextCard chip uses (`contextHandleChip`): a
 * well-formed `ref:<slug>` tag becomes the copyable handle (label + copy = the ref,
 * isRef true → distinct link/accent chip); otherwise the chip falls back to the
 * short id prefix (copying the full id). Mirrors the backend ref grammar.
 *
 * Consistent with this repo's convention (see SessionDetail.uuid.test.tsx) of
 * unit-testing the component's decision predicate rather than adding React render
 * test infra.
 */
import { contextHandleChip, findRefTag, REF_TAG_REGEX } from './refHelpers';

const ID = 'c875b2af-9020-41b7-9595-d70221603464';

describe('named-ref chip grammar', () => {
  test('REF_TAG_REGEX matches the canonical grammar, rejects garbage', () => {
    expect(REF_TAG_REGEX.test('ref:resume')).toBe(true);
    expect(REF_TAG_REGEX.test('ref:cp-gaps')).toBe(true);
    expect(REF_TAG_REGEX.test('ref:audit-retrieval-2')).toBe(true);
    expect(REF_TAG_REGEX.test('ref:Resume')).toBe(false);
    expect(REF_TAG_REGEX.test('ref:my resume')).toBe(false);
    expect(REF_TAG_REGEX.test('ref:-bad')).toBe(false);
    expect(REF_TAG_REGEX.test('ref:')).toBe(false);
    expect(REF_TAG_REGEX.test('task:abc12345')).toBe(false);
  });

  test('findRefTag returns the first well-formed ref, ignores malformed/non-ref tags', () => {
    expect(findRefTag(['audit', 'ref:resume', 'task:abc12345'])).toBe('ref:resume');
    expect(findRefTag(['audit', 'task:abc12345'])).toBeUndefined();
    expect(findRefTag(['ref:Bad Slug'])).toBeUndefined();
    expect(findRefTag(undefined)).toBeUndefined();
  });
});

describe('contextHandleChip decision', () => {
  test('named ref → ref handle is the label + copy text, flagged isRef', () => {
    const chip = contextHandleChip(['ref:resume', 'handoff'], ID);
    expect(chip).toEqual({ label: 'ref:resume', copyText: 'ref:resume', isRef: true });
  });

  test('no ref → short id label, full id copy text, not a ref', () => {
    const chip = contextHandleChip(['handoff', 'audit'], ID);
    expect(chip).toEqual({ label: ID.slice(0, 8), copyText: ID, isRef: false });
  });

  test('malformed ref does NOT promote to a chip (falls back to id)', () => {
    const chip = contextHandleChip(['ref:My Resume'], ID);
    expect(chip.isRef).toBe(false);
    expect(chip.copyText).toBe(ID);
  });
});
