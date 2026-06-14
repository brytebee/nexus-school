// Tier Gates logic - extracted from nav.js

const TIER_LEVELS = {
  Standalone: 1,
  Silver: 1,
  Gold: 2,
  Diamond: 3
};

function canAccessView(currentTier, requiredTier) {
  if (!requiredTier) return true;
  const currentLevel = TIER_LEVELS[currentTier] || 1;
  const requiredLevel = TIER_LEVELS[requiredTier] || 1;
  return currentLevel >= requiredLevel;
}

module.exports = { canAccessView, TIER_LEVELS };
