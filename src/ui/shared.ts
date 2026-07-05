import type { Army, Color, GameState, Piece, PrimaryAction, Slot, Square, Turn } from '../engine/types';

// ─── Army metadata ───────────────────────────────────────────────────────────

export const ARMY_NAMES: Record<Army, string> = {
  Crown:   'The Crown',
  Phantom: 'The Phantom',
  Accord:  'The Accord',
  Twins:   'The Twins',
  Veil:    'The Veil',
  Wild:    'The Wild',
};

export const ARMY_TAGLINES: Record<Army, string> = {
  Crown:   'Highest raw material; castles; flexible',
  Phantom: 'Shade gives piercing check; homing Thralls',
  Accord:  'Herald Banner empowers your phalanx',
  Twins:   'Two royals; Rally action; Shatter',
  Veil:    'Essence-gated teleporting Wraith',
  Wild:    'Chancellor, siege engine, ambush predator',
};

export const ARMIES: Army[] = ['Crown', 'Phantom', 'Accord', 'Twins', 'Veil', 'Wild'];

// ─── Piece colors ─────────────────────────────────────────────────────────────
// W = bright, B = darker/muted variant

export const PIECE_COLORS: Record<Army, Record<Color, string>> = {
  Crown:   { W: '#f5d660', B: '#c49a18' },
  Phantom: { W: '#8ecce8', B: '#3d82b8' },
  Accord:  { W: '#6ddba0', B: '#2a9c6a' },
  Twins:   { W: '#f07878', B: '#a02c2c' },
  Veil:    { W: '#d088f5', B: '#8a38cc' },
  Wild:    { W: '#f0a840', B: '#ba6c10' },
};

// Accent for UI chrome (always bright, used for cards and labels)
export const ARMY_ACCENTS: Record<Army, string> = {
  Crown:   '#f5d660',
  Phantom: '#8ecce8',
  Accord:  '#6ddba0',
  Twins:   '#f07878',
  Veil:    '#d088f5',
  Wild:    '#f0a840',
};

export function getSlotName(slot: Slot, army: Army, promoted: boolean): string {
  if (promoted) return slotBaseName(slot);
  return SLOT_NAMES[army]?.[slot] ?? slotBaseName(slot);
}

function slotBaseName(slot: Slot): string {
  const names: Record<Slot, string> = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn' };
  return names[slot];
}

const SLOT_NAMES: Partial<Record<Army, Partial<Record<Slot, string>>>> = {
  Phantom: { Q: 'Shade', P: 'Thrall' },
  Accord:  { Q: 'Herald' },
  Twins:   { K: 'Warlord' },
  Veil:    { Q: 'Wraith', R: 'Wisp' },
  Wild:    { Q: 'Apex', R: 'Behemoth', B: 'Stalker', N: 'Bronco' },
};

// ─── Piece move reminders (shown while a piece is selected) ──────────────────

const STANDARD_PIECE_INFO: Record<Slot, string> = {
  K: 'Royal. Steps one square in any direction. Cross the midline to win by invasion.',
  Q: 'Slides any distance along ranks, files, and diagonals.',
  R: 'Slides any distance along ranks and files.',
  B: 'Slides any distance along diagonals.',
  N: 'Jumps in an L-shape, over anything in the way.',
  P: 'Steps forward one; captures one square diagonally forward; promotes on the last rank.',
};

const ARMY_PIECE_INFO: Partial<Record<Army, Partial<Record<Slot, string>>>> = {
  Crown: {
    K: 'Royal. Steps one square in any direction; may castle. Cross the midline to win by invasion.',
    P: 'Forward one (two from start); captures diagonally; en passant; promotes on the last rank.',
  },
  Phantom: {
    Q: 'Slides like a Queen but never captures. Its check pierces — blocking is impossible; move the King or take the Shade.',
    P: 'Forward one (no double step); captures diagonally; or homes one step toward the enemy King. Promotes.',
  },
  Accord: {
    Q: 'Steps one square, never captures. Friendly Knights, Bishops, and Rooks next to it are Empowered with a bonus king-step.',
  },
  Twins: {
    K: 'Royal. Steps one square; afterwards one Warlord may Rally a free step. Can Shatter everything adjacent. Both Warlords past the midline wins.',
  },
  Veil: {
    Q: 'Moves as a Queen or teleports to any empty square. Captures cost 1 Essence; checks need ≥1 — at 0 Essence it is inert.',
    R: 'Teleports to any empty square. Never captures and threatens nothing.',
  },
  Wild: {
    Q: 'Chancellor: slides like a Rook or jumps like a Knight.',
    R: 'Up to 3 squares orthogonally; capturing triggers a Rampage that clears the whole path. Enemies must be within 2 squares to capture it.',
    B: 'Up to 2 squares diagonally. Strikes without moving (target dies, Stalker stays), then cannot capture on your next turn.',
    N: 'Knight jumps — and may capture friendly pieces too.',
  },
};

/** One-line reminder of what a piece does, keyed by army + slot. */
export function getPieceInfo(slot: Slot, army: Army, promoted: boolean): string {
  if (promoted) return STANDARD_PIECE_INFO[slot];
  return ARMY_PIECE_INFO[army]?.[slot] ?? STANDARD_PIECE_INFO[slot];
}

// ─── Turn helpers ─────────────────────────────────────────────────────────────

export function getPrimaryFrom(turn: Turn): Square {
  const p = turn.primary;
  switch (p.type) {
    case 'standard': return p.from;
    case 'teleport': return p.from;
    case 'shatter':  return p.warlordSquare;
    case 'rampage':  return p.from;
    case 'strike':   return p.from;
  }
}

export function getPrimaryDest(turn: Turn): Square {
  const p = turn.primary;
  switch (p.type) {
    case 'standard': return p.to;
    case 'teleport': return p.to;
    case 'shatter':  return p.warlordSquare; // stays in place; tapped again
    case 'rampage':  return p.to;
    case 'strike':   return p.target;
  }
}

export type DestHighlightType =
  | 'legal-move'
  | 'legal-capture'
  | 'legal-special'
  | 'legal-teleport-move'
  | 'legal-teleport-capture'
  | 'legal-homing'
  | 'legal-friendly-capture'
  | 'legal-rally';

export type HighlightType = 'selected' | DestHighlightType | 'last-from' | 'last-to' | 'check';

/** Classify a turn's destination highlight. */
export function getDestHighlight(
  turn: Turn,
  board: GameState['board'],
  moverColor: Color,
  moverArmy: Army,
): DestHighlightType {
  const p = turn.primary;
  switch (p.type) {
    case 'shatter':
      return 'legal-special';
    case 'strike':
      return 'legal-special';
    case 'rampage':
      return 'legal-special';
    case 'teleport':
      return p.isCapture ? 'legal-teleport-capture' : 'legal-teleport-move';
    case 'standard': {
      const target = board[p.to];
      if (target) {
        return target.color === moverColor ? 'legal-friendly-capture' : 'legal-capture';
      }
      // Phantom Thrall homing moves (non-forward empty-square moves)
      if (moverArmy === 'Phantom' && isThrallHomingMove(turn, board, moverColor)) {
        return 'legal-homing';
      }
      return 'legal-move';
    }
  }
}

/**
 * Build a map of { square → highlight type } for all legal destinations
 * of turns originating from the selected square.
 * Priority: capture > friendly-capture > special > teleport-capture > homing > move > teleport-move > rally
 */
export function buildHighlightMap(
  turns: Turn[],
  board: GameState['board'],
  moverColor: Color,
  moverArmy: Army,
): Map<Square, DestHighlightType> {
  const priority: Record<DestHighlightType, number> = {
    'legal-capture':           7,
    'legal-friendly-capture':  6,
    'legal-special':           5,
    'legal-teleport-capture':  4,
    'legal-homing':            3,
    'legal-move':              2,
    'legal-teleport-move':     1,
    'legal-rally':             0,
  };
  const map = new Map<Square, DestHighlightType>();
  for (const t of turns) {
    const dest = getPrimaryDest(t);
    const hl = getDestHighlight(t, board, moverColor, moverArmy);
    const cur = map.get(dest);
    if (cur === undefined || priority[hl] > priority[cur]) {
      map.set(dest, hl);
    }
  }
  return map;
}

/** Determine whether a StandardMove from a Phantom Thrall is a homing move (non-forward empty-square move). */
export function isThrallHomingMove(turn: Turn, board: GameState['board'], moverColor: Color): boolean {
  const p = turn.primary;
  if (p.type !== 'standard') return false;
  const piece = board[p.from];
  if (!piece || piece.slot !== 'P' || piece.promoted) return false;
  if (board[p.to] !== null) return false; // captures are not homing
  const dr = squareRank(p.to) - squareRank(p.from);
  const df = squareFile(p.to) - squareFile(p.from);
  const isForwardPush =
    (moverColor === 'W' && dr === 1 && df === 0) ||
    (moverColor === 'B' && dr === -1 && df === 0);
  return !isForwardPush;
}

/** Compare two PrimaryAction values for structural equality (used for Twins staging). */
export function primaryEq(a: PrimaryAction, b: PrimaryAction): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'standard':
      return b.type === 'standard' && a.from === b.from && a.to === b.to && a.promotion === b.promotion;
    case 'teleport':
      return b.type === 'teleport' && a.from === b.from && a.to === b.to;
    case 'shatter':
      return b.type === 'shatter' && a.warlordSquare === b.warlordSquare;
    case 'rampage':
      return b.type === 'rampage' && a.from === b.from && a.to === b.to;
    case 'strike':
      return b.type === 'strike' && a.from === b.from && a.target === b.target;
  }
}

/** Chebyshev distance between two squares. */
export function chebyshev(a: Square, b: Square): number {
  return Math.max(Math.abs(squareRank(a) - squareRank(b)), Math.abs(squareFile(a) - squareFile(b)));
}

/**
 * Build a highlight map for rally destinations (during Twins staging phase).
 * All rally targets get 'legal-rally'.
 */
export function buildRallyHighlightMap(stagingTurns: Turn[]): Map<Square, DestHighlightType> {
  const map = new Map<Square, DestHighlightType>();
  for (const t of stagingTurns) {
    if (t.rally) map.set(t.rally.to, 'legal-rally');
  }
  return map;
}

/** Return whether a royal piece has crossed the midline for invasion purposes. */
export function hasCrossedMidline(sq: Square, color: Color): boolean {
  const rank = squareRank(sq);
  return color === 'W' ? rank >= 4 : rank <= 3;
}

/** Compute Chebyshev-2 "armor zone" squares around a given square (clipped to board). */
export function armorZone(sq: Square): Set<Square> {
  const zone = new Set<Square>();
  const rank = squareRank(sq), file = squareFile(sq);
  for (let dr = -2; dr <= 2; dr++) {
    for (let df = -2; df <= 2; df++) {
      const r = rank + dr, f = file + df;
      if (r >= 0 && r <= 7 && f >= 0 && f <= 7) zone.add(r * 8 + f);
    }
  }
  return zone;
}

/** Return neighbors (8-direction adjacents) of a square, clipped to board. */
export function squareNeighbors(sq: Square): Square[] {
  const result: Square[] = [];
  const rank = squareRank(sq), file = squareFile(sq);
  for (let dr = -1; dr <= 1; dr++) {
    for (let df = -1; df <= 1; df++) {
      if (dr === 0 && df === 0) continue;
      const r = rank + dr, f = file + df;
      if (r >= 0 && r <= 7 && f >= 0 && f <= 7) result.push(r * 8 + f);
    }
  }
  return result;
}

// ─── Captures ─────────────────────────────────────────────────────────────────

export function extractCaptures(state: GameState, turn: Turn): Piece[] {
  const { board, enPassantTarget, sideToMove } = state;
  const captures: Piece[] = [];
  const p = turn.primary;

  switch (p.type) {
    case 'standard': {
      const target = board[p.to];
      if (target) {
        captures.push(target);
      } else if (enPassantTarget !== null && p.to === enPassantTarget) {
        const dir = sideToMove === 'W' ? -8 : 8;
        const ep = board[p.to + dir];
        if (ep) captures.push(ep);
      }
      break;
    }
    case 'teleport':
      if (p.isCapture) {
        const t = board[p.to];
        if (t) captures.push(t);
      }
      break;
    case 'shatter': {
      const wf = p.warlordSquare % 8;
      const wr = Math.floor(p.warlordSquare / 8);
      for (let dr = -1; dr <= 1; dr++) {
        for (let df = -1; df <= 1; df++) {
          if (dr === 0 && df === 0) continue;
          const r = wr + dr, f = wf + df;
          if (r >= 0 && r < 8 && f >= 0 && f < 8) {
            const t = board[r * 8 + f];
            if (t) captures.push(t);
          }
        }
      }
      break;
    }
    case 'rampage':
      for (const sq of p.captures) {
        const t = board[sq];
        if (t) captures.push(t);
      }
      break;
    case 'strike': {
      const t = board[p.target];
      if (t) captures.push(t);
      break;
    }
  }

  return captures;
}

// ─── Board square helpers ─────────────────────────────────────────────────────

export function squareRank(sq: Square): number { return Math.floor(sq / 8); }
export function squareFile(sq: Square): number { return sq % 8; }
export function isLightSquare(sq: Square): boolean {
  return (squareRank(sq) + squareFile(sq)) % 2 !== 0;
}

/** Returns board squares in grid order (top-left → bottom-right) for the given orientation. */
export function boardSquaresInOrder(flipped: boolean): Square[] {
  const squares: Square[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (flipped) {
        squares.push(row * 8 + (7 - col));
      } else {
        squares.push((7 - row) * 8 + col);
      }
    }
  }
  return squares;
}
