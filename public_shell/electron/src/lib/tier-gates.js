// Tier Gates logic - extracted from nav.js

const TIER_LEVELS = {
  Standalone: 1,
  Silver: 1,
  Gold: 2,
  Diamond: 3
};

function canAccessView() {
  // Phase 3: Per-student tier gates removed — all features open to all schools.
  return true;
}

module.exports = { canAccessView, TIER_LEVELS };
