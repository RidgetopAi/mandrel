import { aggregateFolder, filesInFolder } from './folder-summary';
import { makeScan } from '../../views/__fixtures__/scan.fixture';

describe('aggregateFolder', () => {
  it('rolls up files/functions/classes/warnings for src', () => {
    const scan = makeScan({ withClasses: true });
    const s = aggregateFolder(scan, 'src');
    // src holds a.ts + b.ts
    expect(s.fileCount).toBe(2);
    expect(s.functionCount).toBe(3); // a.ts(2) + b.ts(1)
    expect(s.classCount).toBe(1); // Widget in a.ts
    expect(s.warningCount).toBe(1); // circular dep touches src
    expect(s.warningsByLevel.warning).toBe(1);
    expect(s.warningsByLevel.error).toBe(0);
    expect(s.warningsByLevel.info).toBe(0);
  });

  it('rolls up src/util independently', () => {
    const scan = makeScan({ withClasses: true });
    const s = aggregateFolder(scan, 'src/util');
    expect(s.fileCount).toBe(2); // c.ts + d.ts
    expect(s.functionCount).toBe(1); // c.ts(1)
    expect(s.classCount).toBe(0);
    expect(s.warningCount).toBe(1); // large-file on util/c.ts
    expect(s.warningsByLevel.info).toBe(1);
  });

  it('returns zeroed counts for an unknown folder', () => {
    const scan = makeScan();
    const s = aggregateFolder(scan, 'does/not/exist');
    expect(s).toMatchObject({
      folderPath: 'does/not/exist',
      fileCount: 0,
      functionCount: 0,
      classCount: 0,
      warningCount: 0,
    });
  });

  it('counts classCount as 0 when the scan has no classes', () => {
    const scan = makeScan(); // withClasses defaults off
    expect(aggregateFolder(scan, 'src').classCount).toBe(0);
  });

  it('filesInFolder returns only the files directly in the folder', () => {
    const scan = makeScan();
    expect(filesInFolder(scan, 'src').map((f) => f.id).sort()).toEqual([
      'file:a',
      'file:b',
    ]);
  });
});
