import { shapeFileClasses } from './file-classes';
import { makeScan } from '../../views/__fixtures__/scan.fixture';
import type { FileNode } from '../../core-types';

describe('shapeFileClasses', () => {
  it('resolves a file\'s class ids into render-ready shapes', () => {
    const scan = makeScan({ withClasses: true });
    const fileA = scan.nodes['file:a'] as FileNode;
    const classes = shapeFileClasses(fileA, scan.nodes);
    expect(classes).toHaveLength(1);
    expect(classes[0]).toEqual({
      id: 'class:a1',
      name: 'Widget',
      methods: ['render', 'dispose'],
      extends: 'Component',
      implements: ['Disposable'],
      isExported: true,
    });
  });

  it('returns an empty array for a file with no classes', () => {
    const scan = makeScan({ withClasses: true });
    const fileB = scan.nodes['file:b'] as FileNode;
    expect(shapeFileClasses(fileB, scan.nodes)).toEqual([]);
  });

  it('skips ids that do not resolve to a class node', () => {
    const scan = makeScan({ withClasses: true });
    const fileA = scan.nodes['file:a'] as FileNode;
    // Point at a bogus id and a function id — neither is a class.
    const tampered: FileNode = { ...fileA, classes: ['class:missing', 'fn:a1'] };
    expect(shapeFileClasses(tampered, scan.nodes)).toEqual([]);
  });
});
