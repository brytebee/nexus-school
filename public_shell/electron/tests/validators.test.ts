import { describe, it, expect } from 'vitest';
import {
  validateUsername,
  validatePhone,
  validateEmail,
  validatePin,
  validateName,
  validateSecurityAnswer,
  validateDOB
} from '../src/lib/validators';

describe('Validators Unit Tests', () => {
  describe('validateUsername', () => {
    it('accepts valid usernames', () => {
      expect(validateUsername('john_doe').ok).toBe(true);
      expect(validateUsername('mr.obi').ok).toBe(true);
      expect(validateUsername('admin-01').ok).toBe(true);
    });

    it('rejects invalid usernames', () => {
      expect(validateUsername('').ok).toBe(false);
      expect(validateUsername('ab').ok).toBe(false); // too short (<3)
      expect(validateUsername('john doe').ok).toBe(false); // space
      expect(validateUsername("'; DROP TABLE").ok).toBe(false); // special chars
      expect(validateUsername('_admin').ok).toBe(false); // leading special char
      expect(validateUsername('a'.repeat(41)).ok).toBe(false); // too long (>40)
    });
  });

  describe('validatePhone', () => {
    it('accepts valid Nigerian and international phones', () => {
      expect(validatePhone('08012345678').ok).toBe(true);
      expect(validatePhone('07012345678').ok).toBe(true);
      expect(validatePhone('09012345678').ok).toBe(true);
      expect(validatePhone('+2348012345678').ok).toBe(true);
      expect(validatePhone('+12025550123').ok).toBe(true);
    });

    it('allows blank if not required', () => {
      expect(validatePhone('', false).ok).toBe(true);
      expect(validatePhone(null, false).ok).toBe(true);
    });

    it('rejects invalid phone formats', () => {
      expect(validatePhone('90hdy83a', true).ok).toBe(false);
      expect(validatePhone('1234', true).ok).toBe(false);
      expect(validatePhone('08012', true).ok).toBe(false);
      expect(validatePhone('', true).ok).toBe(false);
    });
  });

  describe('validateEmail', () => {
    it('accepts valid emails', () => {
      expect(validateEmail('a@b.com').ok).toBe(true);
      expect(validateEmail('school@nexus.edu.ng').ok).toBe(true);
    });

    it('allows blank if not required', () => {
      expect(validateEmail('', false).ok).toBe(true);
      expect(validateEmail(undefined, false).ok).toBe(true);
    });

    it('rejects invalid emails', () => {
      expect(validateEmail('notanemail', true).ok).toBe(false);
      expect(validateEmail('@no.com', true).ok).toBe(false);
      expect(validateEmail('no@', true).ok).toBe(false);
      expect(validateEmail('', true).ok).toBe(false);
    });
  });

  describe('validatePin', () => {
    it('validates pin mode — exactly 4 digits required', () => {
      expect(validatePin('1234', 'pin').ok).toBe(true);        // valid
      expect(validatePin('12345678', 'pin').ok).toBe(false);   // too long (> 4)
      expect(validatePin('123', 'pin').ok).toBe(false);        // too short
      expect(validatePin('12345', 'pin').ok).toBe(false);      // too long (5)
      expect(validatePin('abcd', 'pin').ok).toBe(false);       // non-digits
    });

    it('validates password mode', () => {
      expect(validatePin('secret1', 'password').ok).toBe(true);
      expect(validatePin('abc', 'password').ok).toBe(false); // too short
    });
  });

  describe('validateName', () => {
    it('accepts valid full names', () => {
      expect(validateName('Jane Smith').ok).toBe(true);
      expect(validateName("O'Brien").ok).toBe(true);
    });

    it('rejects invalid names', () => {
      expect(validateName('12345').ok).toBe(false); // no letters
      expect(validateName('A').ok).toBe(false); // too short
      expect(validateName('').ok).toBe(false);
    });
  });

  describe('validateSecurityAnswer', () => {
    it('validates security answers', () => {
      expect(validateSecurityAnswer('lagos').ok).toBe(true);
      expect(validateSecurityAnswer('a').ok).toBe(false); // min 2 chars
      expect(validateSecurityAnswer('').ok).toBe(false);
    });
  });

  describe('validateDOB', () => {
    it('accepts valid dates of birth', () => {
      expect(validateDOB('2005-03-15').ok).toBe(true);
    });

    it('allows blank if not required', () => {
      expect(validateDOB('', false).ok).toBe(true);
    });

    it('rejects invalid or future dates', () => {
      expect(validateDOB('2099-01-01', true).ok).toBe(false); // future
      expect(validateDOB('1800-01-01', true).ok).toBe(false); // pre-1920
      expect(validateDOB('not-a-date', true).ok).toBe(false);
    });
  });
});
