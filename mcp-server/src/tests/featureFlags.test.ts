import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { FeatureFlagStore } from '@/utils/featureFlags';

const tempDir = path.join(os.tmpdir(), 'aidis-feature-flag-tests');

async function writeConfig(flags: Record<string, boolean>, version = 1) {
  await fs.mkdir(tempDir, { recursive: true });
  const filePath = path.join(tempDir, 'flags.json');
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        version,
        updatedAt: '2025-09-15T00:00:00.000Z',
        flags,
      },
      null,
      2,
    ),
    'utf8',
  );
  return filePath;
}

describe('FeatureFlagStore', () => {
  beforeEach(() => {
    delete process.env.AIDIS_FEATURE_FLAG_OVERRIDES;
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('loads flags from configuration file', async () => {
    const filePath = await writeConfig({ 'phase1.test': true });
    const store = new FeatureFlagStore(filePath, 0);

    await store.initialize();

    expect(store.getFlag('phase1.test')).toBe(true);
    expect(store.getMetadata()).toEqual({ version: 1, updatedAt: '2025-09-15T00:00:00.000Z' });
  });

  it('applies environment overrides and refreshes on demand', async () => {
    const filePath = await writeConfig({ 'phase1.test': false }, 2);
    process.env.AIDIS_FEATURE_FLAG_OVERRIDES = JSON.stringify({ 'phase1.test': true });

    const store = new FeatureFlagStore(filePath, 0);
    await store.initialize();

    expect(store.getFlag('phase1.test')).toBe(true);

    await writeConfig({ 'phase1.test': false, 'phase1.newFeature': true }, 3);
    await store.refresh();

    expect(store.getFlag('phase1.test')).toBe(true);
    expect(store.getFlag('phase1.newFeature')).toBe(true);
    expect(store.getMetadata()).toEqual({ version: 3, updatedAt: '2025-09-15T00:00:00.000Z' });
  });
});
