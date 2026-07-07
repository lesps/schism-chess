// Centralised hint & UI strings for army-specific interactions.
// Keep these plain and action-oriented: say what the player can/cannot
// do right now, not just the rule's name. E2e tests match on the
// phrases "Piercing check" and "Exhausted" — keep those words.

export const HINTS = {
  FIRST_MOVE: 'Tap any piece to see what it does and where it can move.',
  NO_LEGAL_MOVES: 'No legal moves right now.',
  INSPECT_WAITING: "It isn't this piece's turn.",
  TWINS_WARLORD_IN_CHECK: 'Warlord in check — your main move alone must escape it. Rally cannot save a lone checked Warlord.',
  TWINS_BOTH_IN_CHECK: 'Both Warlords in check — use your move and your Rally together to bring both to safety.',
  TWINS_RALLY_PHASE: 'Rally (optional): tap a pink dot to step a Warlord one square, or skip.',
  TWINS_SHATTER_ILLEGAL_ADJACENT: 'Shatter unavailable — the Warlords are next to each other.',
  TWINS_SHATTER_DESC: 'Destroys every piece around this Warlord — friend and foe. You can still Rally afterwards.',
  PIERCING_CHECK: 'Piercing check — blocking is impossible. Move your King or capture the Shade.',
  STALKER_EXHAUSTED: 'Stalker is Exhausted — it may move this turn, but not capture.',
  BEHEMOTH_ARMOR_DESC: 'Armor: enemies can only capture this Behemoth from inside the tinted 2-square zone.',
  RAMPAGE_DESC: 'the Behemoth clears every piece in its path, including your own.',
  HERALD_BANNER_DESC: 'Banner zone — friendly Knights, Bishops and Rooks inside it gain a bonus king-step.',
  EMPOWERED_DESC: 'Empowered by the Herald — may also move or capture one square in any direction.',
  FRIENDLY_CAPTURE_CONFIRM: 'This captures your own piece. Continue?',
  SKIP_RALLY: 'Skip Rally',
  BACK: '← Back',
  CONFIRM: 'Confirm',
  CANCEL: 'Cancel',
  SHATTER: 'Shatter',
  RAMPAGE_CONFIRM_TITLE: 'Confirm Rampage',
  SHATTER_CONFIRM_TITLE: 'Confirm Shatter',
} as const;
