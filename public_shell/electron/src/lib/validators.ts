/**
 * Nexus School OS — Input Validation Utilities
 * Centralized validator functions for format checks across forms & API calls.
 */

export interface ValidationResult {
  ok: boolean;
  error: string | null;
}

export function validateUsername(v: string): ValidationResult {
  const trimmed = (v || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Username is required.' };
  }
  if (trimmed.length < 3 || trimmed.length > 40) {
    return { ok: false, error: 'Username must be between 3 and 40 characters.' };
  }
  // Alphanumeric + underscore + hyphen + dot, no spaces
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return { ok: false, error: 'Username can only contain letters, numbers, underscores (_), hyphens (-), and dots (.). No spaces allowed.' };
  }
  if (/^[._-]/.test(trimmed) || /[._-]$/.test(trimmed)) {
    return { ok: false, error: 'Username cannot start or end with a special character.' };
  }
  return { ok: true, error: null };
}

export function validatePhone(v: string | undefined | null, isRequired = false): ValidationResult {
  const trimmed = (v || '').trim();
  if (!trimmed) {
    if (isRequired) return { ok: false, error: 'Phone number is required.' };
    return { ok: true, error: null };
  }

  // Strip spaces, dashes, parentheses
  const clean = trimmed.replace(/[\s\-()]/g, '');

  // Nigerian format: 070, 080, 081, 090, 091 (11 digits) or +234 / 234 prefix
  const isNigerian = /^(\+?234|0)[789][01]\d{8}$/.test(clean);
  const isGenericIntl = /^\+?[1-9]\d{6,14}$/.test(clean);

  if (!isNigerian && !isGenericIntl) {
    return { ok: false, error: 'Enter a valid phone number (e.g. 08012345678 or +2348012345678).' };
  }

  return { ok: true, error: null };
}

export function validateEmail(v: string | undefined | null, isRequired = false): ValidationResult {
  const trimmed = (v || '').trim();
  if (!trimmed) {
    if (isRequired) return { ok: false, error: 'Email address is required.' };
    return { ok: true, error: null };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { ok: false, error: 'Enter a valid email address (e.g. name@school.com).' };
  }

  return { ok: true, error: null };
}

export function validatePin(v: string, type: 'pin' | 'password' = 'pin'): ValidationResult {
  const trimmed = (v || '').trim();
  if (!trimmed) {
    return { ok: false, error: type === 'pin' ? 'PIN is required.' : 'Password is required.' };
  }

  if (type === 'pin') {
    if (trimmed.length !== 4) {
      return { ok: false, error: 'PIN must be exactly 4 digits.' };
    }
    if (!/^\d+$/.test(trimmed)) {
      return { ok: false, error: 'PIN must contain digits only.' };
    }
  } else {
    if (trimmed.length < 6 || trimmed.length > 128) {
      return { ok: false, error: 'Password must be between 6 and 128 characters.' };
    }
  }

  return { ok: true, error: null };
}

export function validateName(v: string, label = 'Full Name'): ValidationResult {
  const trimmed = (v || '').trim();
  if (!trimmed) {
    return { ok: false, error: `${label} is required.` };
  }
  if (trimmed.length < 2 || trimmed.length > 80) {
    return { ok: false, error: `${label} must be between 2 and 80 characters.` };
  }
  if (!/[a-zA-Z]/.test(trimmed)) {
    return { ok: false, error: `${label} must contain letters.` };
  }
  return { ok: true, error: null };
}

export function validateSecurityAnswer(v: string): ValidationResult {
  const trimmed = (v || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Security recovery answer is required.' };
  }
  if (trimmed.length < 2) {
    return { ok: false, error: 'Recovery answer must be at least 2 characters.' };
  }
  return { ok: true, error: null };
}

export function validateDOB(v: string | undefined | null, isRequired = false): ValidationResult {
  const trimmed = (v || '').trim();
  if (!trimmed) {
    if (isRequired) return { ok: false, error: 'Date of birth is required.' };
    return { ok: true, error: null };
  }

  const dob = new Date(trimmed);
  if (isNaN(dob.getTime())) {
    return { ok: false, error: 'Invalid date of birth format.' };
  }

  const now = new Date();
  if (dob > now) {
    return { ok: false, error: 'Date of birth cannot be in the future.' };
  }

  const minYear = 1920;
  if (dob.getFullYear() < minYear) {
    return { ok: false, error: `Year of birth cannot be earlier than ${minYear}.` };
  }

  return { ok: true, error: null };
}

export function validateNonEmpty(v: string, label: string): ValidationResult {
  const trimmed = (v || '').trim();
  if (!trimmed) {
    return { ok: false, error: `${label} is required.` };
  }
  return { ok: true, error: null };
}
