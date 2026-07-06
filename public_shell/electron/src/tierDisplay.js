const TIER_DISPLAY = {
  standalone: 'Standalone',
  silver:     'Silver',
  gold:       'Gold',
  diamond:    'Diamond',
};

/** Converts any tier casing to its canonical Title Case display name. */
function toDisplayTier(tier) {
  return TIER_DISPLAY[(tier || '').toLowerCase()] ?? tier;
}

module.exports = { toDisplayTier };
