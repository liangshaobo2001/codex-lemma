import { describe, expect, it } from 'vitest';
import { appCategories, appPresets } from './appPresets';

describe('connector catalog', () => {
  it('loads every server listed in the index with a known category', () => {
    expect(appPresets.length).toBeGreaterThan(0);
    for (const preset of appPresets) {
      expect(appCategories).toContain(preset.category);
      expect(preset.description.length).toBeLessThanOrEqual(100);
      expect(preset.config).toMatchObject({ url: expect.stringMatching(/^https:\/\//) });
    }
  });

  it('keeps unique names', () => {
    const names = appPresets.map((preset) => preset.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
