import { classifyEffect } from './effects';
import { flags } from './__fixtures__/scan.fixture';
import { SummarySource, type BehavioralSummary } from '../core-types';

function summary(f: ReturnType<typeof flags>): BehavioralSummary {
  return { summary: '', source: SummarySource.AI, analyzedAt: '', flags: f };
}

describe('classifyEffect', () => {
  it('returns unknown when there is no behavioral data (no AI scan)', () => {
    expect(classifyEffect(null)).toBe('unknown');
    expect(classifyEffect(undefined)).toBe('unknown');
  });

  it('classifies pure when no flags are set', () => {
    expect(classifyEffect(summary(flags({})))).toBe('pure');
  });

  it('classifies each single effect', () => {
    expect(classifyEffect(summary(flags({ databaseRead: true })))).toBe('database');
    expect(classifyEffect(summary(flags({ databaseWrite: true })))).toBe('database');
    expect(classifyEffect(summary(flags({ httpCall: true })))).toBe('network');
    expect(classifyEffect(summary(flags({ fileRead: true })))).toBe('filesystem');
    expect(classifyEffect(summary(flags({ fileWrite: true })))).toBe('filesystem');
    expect(classifyEffect(summary(flags({ sendsNotification: true })))).toBe('notification');
    expect(classifyEffect(summary(flags({ modifiesGlobalState: true })))).toBe('state');
    expect(classifyEffect(summary(flags({ hasSideEffects: true })))).toBe('state');
  });

  it('applies priority when multiple flags are set (database > network > filesystem > state)', () => {
    expect(
      classifyEffect(summary(flags({ databaseRead: true, httpCall: true, fileWrite: true })))
    ).toBe('database');
    expect(classifyEffect(summary(flags({ httpCall: true, fileWrite: true })))).toBe('network');
    expect(
      classifyEffect(summary(flags({ fileWrite: true, hasSideEffects: true })))
    ).toBe('filesystem');
  });
});
