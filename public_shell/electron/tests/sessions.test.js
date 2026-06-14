import { describe, it, expect } from 'vitest';
import { generateSessionsList } from '../src/lib/sessions';

describe('sessions utility', () => {
  it('generates a progressively incremental list of academic sessions', () => {
    const list = generateSessionsList(2023);
    const currentYear = new Date().getFullYear();
    const expectedMaxYear = currentYear + 2;
    
    // Check that it starts with the base year
    expect(list[0]).toBe('2023/2024');
    
    // Check that it contains the current and future years
    expect(list).toContain(`${currentYear}/${currentYear + 1}`);
    expect(list[list.length - 1]).toBe(`${expectedMaxYear}/${expectedMaxYear + 1}`);
  });
});
