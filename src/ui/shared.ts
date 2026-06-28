import type { Army, Color, GameState, Piece, Slot, Square, Turn } from '../engine/types';

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

// ─── Unicode chess glyphs ─────────────────────────────────────────────────────
// White-piece glyphs (hollow/outlined) for W; Black-piece glyphs (filled) for B

const W_GLYPHS: Record<Slot, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' };
const B_GLYPHS: Record<Slot, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };

export function getPieceGlyph(slot: Slot, color: Color): string {
  return color === 'W' ? W_GLYPHS[slot] : B_GLYPHS[slot];
}

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

export type HighlightType = 'selected' | 'legal-move' | 'legal-capture' | 'legal-special'
                          | 'last-from' | 'last-to' | 'check';

/** Classify a turn's destination highlight: move (empty) | capture | special. */
export function getDestHighlight(turn: Turn, board: GameState['board']): 'legal-move' | 'legal-capture' | 'legal-special' {
  const p = turn.primary;
  switch (p.type) {
    case 'shatter':
      return 'legal-special';
    case 'strike':
      return 'legal-special';
    case 'rampage':
      return 'legal-special';
    case 'teleport':
      return p.isCapture ? 'legal-capture' : 'legal-special';
    case 'standard': {
      const target = board[p.to];
      if (target) return 'legal-capture';
      // en-passant capture lands on an empty square
      if (p.promotion === undefined && !target) return 'legal-move';
      return 'legal-move';
    }
  }
}

/**
 * Build a map of { square → highlight type } for all legal destinations
 * of turns originating from the selected square.
 * Priority: legal-capture > legal-special > legal-move
 */
export function buildHighlightMap(
  turns: Turn[],
  board: GameState['board'],
): Map<Square, 'legal-move' | 'legal-capture' | 'legal-special'> {
  const priority = { 'legal-capture': 2, 'legal-special': 1, 'legal-move': 0 } as const;
  const map = new Map<Square, 'legal-move' | 'legal-capture' | 'legal-special'>();
  for (const t of turns) {
    const dest = getPrimaryDest(t);
    const hl = getDestHighlight(t, board);
    const cur = map.get(dest);
    if (cur === undefined || priority[hl] > priority[cur]) {
      map.set(dest, hl);
    }
  }
  return map;
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
