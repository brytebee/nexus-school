import { describe, it, expect } from 'vitest';
const { canAccessView } = require('../src/lib/tier-gates.js');

describe('tier gates engine', () => {
  it('allows access to free/unrated screens across all tiers', () => {
    expect(canAccessView('Silver', null)).toBe(true);
    expect(canAccessView('Silver', undefined)).toBe(true);
    expect(canAccessView('Gold', null)).toBe(true);
    expect(canAccessView('Diamond', null)).toBe(true);
  });

  it('correctly blocks/permits access based on subscription hierarchy', () => {
    // Silver tries to access higher tiers
    expect(canAccessView('Silver', 'Gold')).toBe(false);
    expect(canAccessView('Silver', 'Diamond')).toBe(false);

    // Standalone tries to access higher tiers
    expect(canAccessView('Standalone', 'Gold')).toBe(false);
    expect(canAccessView('Standalone', 'Diamond')).toBe(false);
    expect(canAccessView('Standalone', 'Silver')).toBe(true);

    // Gold tries to access tiers
    expect(canAccessView('Gold', 'Gold')).toBe(true);
    expect(canAccessView('Gold', 'Diamond')).toBe(false);

    // Diamond tries to access tiers
    expect(canAccessView('Diamond', 'Gold')).toBe(true);
    expect(canAccessView('Diamond', 'Diamond')).toBe(true);
  });
});

