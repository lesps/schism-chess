// Square: index = rank * 8 + file
// rank 0 = White's 1st rank, file 0 = a-file
// a1=0, h1=7, a2=8, ..., a8=56, h8=63
export type Square = number;

export type Color = 'W' | 'B';

export type Army = 'Crown' | 'Phantom' | 'Accord' | 'Twins' | 'Veil' | 'Wild';

// Slot identifies the FIDE piece a unit replaces. Army-specific pieces share the slot
// of the piece they occupy: Veil's Wraith = 'Q', Wild's Behemoth = 'R', etc.
// Twins' Warlords = 'K' on BOTH d1 and e1 (no 'Q'-slot piece). Phantom's Thralls = 'P'.
export type Slot = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';

// Reinforcement Promotion (RULES v2.3): a promoted piece IS its army's piece for the
// slot — there is no promoted flag and no hidden state; the board is fully readable.
export interface Piece {
  slot: Slot;
  color: Color;
}

export interface StandardMove {
  type: 'standard';
  from: Square;
  to: Square;
  promotion?: Slot; // Q/R/B/N — the mover's own army piece for that slot (v2.3)
}

export interface TeleportMove {
  type: 'teleport';
  from: Square;
  to: Square;
  isCapture: boolean;
}

export interface Shatter {
  type: 'shatter';
  warlordSquare: Square;
}

// Behemoth rampage: one atomic action capturing every piece in a straight line.
// `captures` lists only non-royal pieces removed (in path order); enemy royals are threats only.
export interface RampageMove {
  type: 'rampage';
  from: Square;
  to: Square;         // Behemoth's final landing square
  captures: Square[]; // squares cleared (friendly + enemy non-royal pieces)
}

// Stalker strike-and-return: target piece removed, Stalker stays at `from`.
export interface StrikeMove {
  type: 'strike';
  from: Square;   // Stalker's home square (returns here after capture)
  target: Square; // square of the captured piece
}

// Accord March (RULES v2.3): the Herald steps from → to (one king-step to an empty
// square) and every friendly piece inside the Banner steps one square in the same
// direction — the column steps from the front; blocked pieces hold. Non-capturing.
export interface MarchMove {
  type: 'march';
  from: Square; // Herald's square
  to: Square;   // Herald's destination (one step; defines the march direction)
}

export type PrimaryAction = StandardMove | TeleportMove | Shatter | RampageMove | StrikeMove | MarchMove;

export interface RallyStep {
  from: Square;
  to: Square;
}

// Turn = { primary; rally? }. The Twins' normal-move + Rally is one atomic unit;
// all legality is evaluated per-Turn, not per sub-move.
export interface Turn {
  primary: PrimaryAction;
  rally?: RallyStep;
}

export interface GameState {
  board: (Piece | null)[];           // length 64
  sideToMove: Color;
  armies: { W: Army; B: Army };
  castlingRights: string;             // FEN-style 'KQkq', '-' if none; meaningful only for Crown
  enPassantTarget: Square | null;
  essence: { W: number; B: number };  // 0–4; starts 2 for Veil sides, 0 for others
  exhausted: Square[];                // squares where a Wild Stalker may not capture next turn
  halfmoveClock: number;
  fullmoveNumber: number;
  positionKeys: string[];             // repetition history — NOT serialized in SFEN-X
  // Per-turn metadata for notation (S9). Not in positionKey; not serialized in SFEN-X.
  lastTurnMeta?: {
    essenceDelta?: { color: Color; from: number; to: number };
  };
}
