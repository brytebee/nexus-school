import { describe, it, expect } from 'vitest';
const { canAccessView } = require('../src/lib/tier-gates.js');

describe('tier gates engine (Phase 3: Deprecated Gates)', () => {
  it('allows access to free/unrated screens across all tiers', () => {
    expect(canAccessView('Silver', null)).toBe(true);
    expect(canAccessView('Silver', undefined)).toBe(true);
    expect(canAccessView('Gold', null)).toBe(true);
    expect(canAccessView('Diamond', null)).toBe(true);
  });

  it('permits access to all views across all tiers unconditionally', () => {
    // Phase 3: Flat subscription model — all tiers have full view access
    expect(canAccessView('Silver', 'Gold')).toBe(true);
    expect(canAccessView('Silver', 'Diamond')).toBe(true);
    expect(canAccessView('Standalone', 'Gold')).toBe(true);
    expect(canAccessView('Standalone', 'Diamond')).toBe(true);
    expect(canAccessView('Standalone', 'Silver')).toBe(true);
    expect(canAccessView('Gold', 'Gold')).toBe(true);
    expect(canAccessView('Gold', 'Diamond')).toBe(true);
    expect(canAccessView('Diamond', 'Gold')).toBe(true);
    expect(canAccessView('Diamond', 'Diamond')).toBe(true);
  });
});

