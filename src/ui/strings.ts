// Centralised hint & UI strings for army-specific interactions.
// S14 may localise or link these to in-app rules pages.

export const HINTS = {
  TWINS_WARLORD_IN_CHECK: 'Warlord in check — primary move must resolve it.',
  TWINS_RALLY_PHASE: 'Rally: move a Warlord one step, or skip.',
  TWINS_SHATTER_ILLEGAL_ADJACENT: 'Shatter blocked — Warlords are adjacent.',
  TWINS_SHATTER_DESC: 'Destroys all adjacent pieces. Then rally (optional).',
  PIERCING_CHECK: 'Piercing check — interposition impossible.',
  STALKER_EXHAUSTED: 'Exhausted — cannot capture this turn.',
  BEHEMOTH_ARMOR_DESC: 'Armor: enemies must be within 2 squares to capture this Behemoth.',
  RAMPAGE_DESC: 'Rampage! Every piece on the path is swept away.',
  HERALD_BANNER_DESC: 'Banner zone — friendly pieces here are Empowered.',
  EMPOWERED_DESC: 'Empowered by the Herald — gains bonus moves.',
  FRIENDLY_CAPTURE_CONFIRM: 'Capture your own piece?',
  SKIP_RALLY: 'Skip Rally',
  BACK: '← Back',
  CONFIRM: 'Confirm',
  CANCEL: 'Cancel',
  SHATTER: 'Shatter',
  RAMPAGE_CONFIRM_TITLE: 'Confirm Rampage',
  SHATTER_CONFIRM_TITLE: 'Confirm Shatter',
} as const;
