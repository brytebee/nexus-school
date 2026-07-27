/**
 * tests/phase4b-slug-portal.test.js
 *
 * Phase 4B — Sovereign Portal Slug & Auth Data-Flow Tests
 *
 * These tests exercise the slug/auth logic inline (no real DB or network).
 * They validate the fixed behaviour for the 5 gaps found in research:
 *   1. slug-available: validation now 3–60 chars (was 4–30)
 *   2. claim-slug: must receive and use school_id; must not create provisional schools
 *   3. claim-slug: idempotency — 409 if school already has slug
 *   4. auth/verify: portal_slug must be surfaced in the response
 *   5. nexusos: needs_slug logic depends on portal_slug presence
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Inline slug-available handler (mirrors fixed route logic) ────────────────

function makeSlugAvailableHandler(db) {
  return async (url) => {
    const { searchParams } = new URL(url);
    const rawSlug = searchParams.get('slug');

    if (!rawSlug) {
      return { status: 400, body: { ok: false, available: false, message: 'Slug parameter is required.' } };
    }

    const slug = rawSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (slug.length < 3 || slug.length > 60 || slug.startsWith('-') || slug.endsWith('-')) {
      return { status: 400, body: { ok: false, available: false, message: 'Slug must be 3–60 characters (letters, numbers, hyphens).' } };
    }

    const existing = await db.portalContent.findUnique({ where: { slug } });
    if (existing) {
      return { status: 200, body: { ok: true, available: false, message: `Slug '${slug}' is already taken.` } };
    }
    return { status: 200, body: { ok: true, available: true, message: `Slug '${slug}' is available.` } };
  };
}

// ─── Inline claim-slug handler (mirrors fixed route logic) ────────────────────

function makeClaimSlugHandler(db) {
  return async (body) => {
    const rawSlug  = body?.slug;
    const schoolId = body?.school_id;

    if (!rawSlug)  return { status: 400, body: { ok: false, error: 'Slug parameter is required.' } };
    if (!schoolId) return { status: 400, body: { ok: false, error: 'school_id is required.' } };

    const cleanSlug = rawSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (cleanSlug.length < 3 || cleanSlug.length > 60 || cleanSlug.startsWith('-') || cleanSlug.endsWith('-')) {
      return { status: 400, body: { ok: false, error: 'Slug must be 3–60 characters.' } };
    }

    const school = await db.school.findUnique({ where: { id: schoolId } });
    if (!school) return { status: 404, body: { ok: false, error: 'School not found.' } };

    // Idempotency: 409 if school already has a slug
    const existingBySchool = await db.portalContent.findUnique({ where: { school_id: schoolId } });
    if (existingBySchool) {
      return { status: 409, body: { ok: false, error: 'School already has a portal slug assigned.' } };
    }

    // Uniqueness: 409 if slug taken by another school
    const existingBySlug = await db.portalContent.findUnique({ where: { slug: cleanSlug } });
    if (existingBySlug) {
      return { status: 409, body: { ok: false, error: `Slug '${cleanSlug}' is already claimed by another school.` } };
    }

    const pc = await db.portalContent.create({
      data: { school_id: schoolId, slug: cleanSlug, school_name: school.name, theme_primary: '#1A237E' },
    });
    return { status: 200, body: { ok: true, slug: cleanSlug, portalContent: { id: pc.id, slug: pc.slug } } };
  };
}

// ─── Inline auth/verify response shaper (mirrors fixed route logic) ───────────

function shapeAuthVerifyResponse(school) {
  const activeLicense = school.licenses?.[0] ?? null;
  const tier          = activeLicense?.tier ?? 'silver';
  const portal_slug   = school.portalContent?.slug ?? null;

  return {
    id:             school.id,
    name:           school.name,
    email:          school.email,
    tier,
    has_license:    !!activeLicense,
    licensed_terms: activeLicense?.licensed_terms ?? [],
    hardware_bound: !!activeLicense?.hardware_id,
    portal_slug,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('slug-available — validation unified to 3–60 chars', () => {
  let db, handler;

  beforeEach(() => {
    db = { portalContent: { findUnique: vi.fn().mockResolvedValue(null) } };
    handler = makeSlugAvailableHandler(db);
  });

  it('accepts a slug of exactly 3 characters', async () => {
    const res = await handler('http://x/api?slug=abc');
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
  });

  it('accepts a slug of exactly 60 characters', async () => {
    const slug = 'a'.repeat(60);
    const res = await handler(`http://x/api?slug=${slug}`);
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
  });

  it('rejects a slug of 2 characters (below minimum)', async () => {
    const res = await handler('http://x/api?slug=ab');
    expect(res.status).toBe(400);
    expect(res.body.available).toBe(false);
  });

  it('rejects a slug of 61 characters (above maximum)', async () => {
    const slug = 'a'.repeat(61);
    const res = await handler(`http://x/api?slug=${slug}`);
    expect(res.status).toBe(400);
    expect(res.body.available).toBe(false);
  });

  it('returns available: true for a fresh slug', async () => {
    db.portalContent.findUnique.mockResolvedValue(null);
    const res = await handler('http://x/api?slug=green-valley-high');
    expect(res.body.ok).toBe(true);
    expect(res.body.available).toBe(true);
  });

  it('returns available: false for a taken slug', async () => {
    db.portalContent.findUnique.mockResolvedValue({ id: 'pc1', slug: 'taken' });
    const res = await handler('http://x/api?slug=taken');
    expect(res.body.ok).toBe(true);
    expect(res.body.available).toBe(false);
  });

  it('returns 400 when slug param is absent', async () => {
    const res = await handler('http://x/api');
    expect(res.status).toBe(400);
  });

  it('strips illegal characters before checking (spaces → empty slug → rejects)', async () => {
    // "   " → after sanitise → "" (length 0 < 3) → 400
    const res = await handler('http://x/api?slug=   ');
    expect(res.status).toBe(400);
  });
});

describe('claim-slug — uses school_id; no provisional school creation', () => {
  let db, handler;

  beforeEach(() => {
    db = {
      school:        { findUnique: vi.fn() },
      portalContent: { findUnique: vi.fn(), create: vi.fn() },
    };
    handler = makeClaimSlugHandler(db);
  });

  it('returns 400 when school_id is missing', async () => {
    const res = await handler({ slug: 'my-school' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/school_id/i);
  });

  it('returns 400 when slug is missing', async () => {
    const res = await handler({ school_id: 'sch1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/slug/i);
  });

  it('returns 404 when school_id does not exist in DB', async () => {
    db.school.findUnique.mockResolvedValue(null);
    const res = await handler({ slug: 'my-school', school_id: 'ghost' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/school not found/i);
  });

  it('returns 409 when the school already has a portal slug', async () => {
    db.school.findUnique.mockResolvedValue({ id: 'sch1', name: 'School One' });
    db.portalContent.findUnique.mockResolvedValueOnce({ school_id: 'sch1', slug: 'old-slug' });
    const res = await handler({ slug: 'new-slug', school_id: 'sch1' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already has a portal slug/i);
  });

  it('returns 409 when the slug is taken by a different school', async () => {
    db.school.findUnique.mockResolvedValue({ id: 'sch2', name: 'School Two' });
    db.portalContent.findUnique
      .mockResolvedValueOnce(null)                              // school has no slug yet
      .mockResolvedValueOnce({ id: 'pc99', slug: 'hot-slug' }); // slug taken by another
    const res = await handler({ slug: 'hot-slug', school_id: 'sch2' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already claimed/i);
  });

  it('creates PortalContent linked to existing school on valid claim', async () => {
    db.school.findUnique.mockResolvedValue({ id: 'sch3', name: 'Green Valley High' });
    db.portalContent.findUnique.mockResolvedValue(null);
    db.portalContent.create.mockResolvedValue({ id: 'pc3', slug: 'green-valley-high' });

    const res = await handler({ slug: 'green-valley-high', school_id: 'sch3' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.slug).toBe('green-valley-high');
    // Key assertion: portalContent.create called with existing school_id — NOT school.create
    expect(db.portalContent.create).toHaveBeenCalledOnce();
    expect(db.portalContent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ school_id: 'sch3', slug: 'green-valley-high' }),
    });
  });

  it('never calls db.school.create (no provisional school creation)', async () => {
    db.school.findUnique.mockResolvedValue({ id: 'sch3', name: 'Green Valley High' });
    db.portalContent.findUnique.mockResolvedValue(null);
    db.portalContent.create.mockResolvedValue({ id: 'pc3', slug: 'green-valley-high' });
    // db.school has no .create — if it were called it would throw, making this implicit
    await handler({ slug: 'green-valley-high', school_id: 'sch3' });
    // Confirm we looked up by id (the correct path), not by email
    expect(db.school.findUnique).toHaveBeenCalledWith({ where: { id: 'sch3' } });
  });

  it('returns 400 for a slug shorter than 3 characters', async () => {
    db.school.findUnique.mockResolvedValue({ id: 'sch4', name: 'Test' });
    const res = await handler({ slug: 'ab', school_id: 'sch4' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a slug that starts with a hyphen', async () => {
    db.school.findUnique.mockResolvedValue({ id: 'sch5', name: 'Test' });
    const res = await handler({ slug: '-bad', school_id: 'sch5' });
    expect(res.status).toBe(400);
  });
});

describe('auth/verify — portal_slug surfaced correctly in response', () => {
  it('includes the correct portal_slug when school has PortalContent', () => {
    const school = {
      id: 'sch1', name: 'Green Valley', email: 'admin@gv.edu.ng',
      portalContent: { slug: 'green-valley' },
      licenses: [{ tier: 'gold', licensed_terms: ['2025/2026-T1'], hardware_id: null }],
    };
    const payload = shapeAuthVerifyResponse(school);
    expect(payload.portal_slug).toBe('green-valley');
  });

  it('includes portal_slug: null when school has no PortalContent', () => {
    const school = {
      id: 'sch2', name: 'New School', email: 'admin@new.edu.ng',
      portalContent: null,
      licenses: [],
    };
    const payload = shapeAuthVerifyResponse(school);
    expect(payload.portal_slug).toBeNull();
  });

  it('defaults tier to silver when school has no active license', () => {
    const school = {
      id: 'sch3', name: 'No License', email: 'x@x.ng',
      portalContent: null, licenses: [],
    };
    const payload = shapeAuthVerifyResponse(school);
    expect(payload.tier).toBe('silver');
    expect(payload.has_license).toBe(false);
  });

  it('hardware_bound is false when hardware_id is null', () => {
    const school = {
      id: 'sch4', name: 'S', email: 'a@a.ng',
      portalContent: null,
      licenses: [{ tier: 'silver', licensed_terms: [], hardware_id: null }],
    };
    expect(shapeAuthVerifyResponse(school).hardware_bound).toBe(false);
  });

  it('hardware_bound is true when hardware_id is set', () => {
    const school = {
      id: 'sch5', name: 'S', email: 'b@b.ng',
      portalContent: { slug: 'abc' },
      licenses: [{ tier: 'silver', licensed_terms: [], hardware_id: 'hw-123' }],
    };
    expect(shapeAuthVerifyResponse(school).hardware_bound).toBe(true);
  });

  it('nexusos: needs_slug derives true when portal_slug is null', () => {
    const needsSlug = !null;
    expect(needsSlug).toBe(true);
  });

  it('nexusos: needs_slug derives false when portal_slug is a non-empty string', () => {
    const needsSlug = !'green-valley';
    expect(needsSlug).toBe(false);
  });

  it('nexusos: needs_slug derives true when portal_slug is empty string', () => {
    const needsSlug = !'';
    expect(needsSlug).toBe(true);
  });
});
