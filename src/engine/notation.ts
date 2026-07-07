import type {
  Army, Color, GameState, Piece, RampageMove, Shatter, Slot, Square,
  StandardMove, StrikeMove, TeleportMove, Turn, RallyStep, PrimaryAction,
} from './types';
import { legalTurns } from './legality';
import { applyTurnUnchecked } from './apply';
import { gameStatus } from './status';
import { getThreatModel } from './threat';
import { squareToAlgebraic, algebraicToSquare } from './sfen';
import { initialState } from './positions';

// ─── Public types ──────────────────────────────────────────────────────────

export interface ParseError {
  readonly error: string;
}

export interface ReplayError {
  readonly moveNumber: number;
  readonly side: Color;
  readonly san: string;
  readonly reason: string;
}

export interface GameRecord {
  readonly armies: { readonly W: Army; readonly B: Army };
  readonly moves: ReadonlyArray<{ readonly white: string; readonly black?: string }>;
  readonly result?: '1-0' | '0-1' | '½-½' | '(=loss)';
}

export function isParseError(x: unknown): x is ParseError {
  return (
    typeof x === 'object' && x !== null &&
    'error' in x && typeof (x as ParseError).error === 'string'
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const FILE_CHARS = 'abcdefgh';
function fileChar(sq: Square): string { return FILE_CHARS[sq & 7]; }
function rankChar(sq: Square): string { return String((sq >> 3) + 1); }

/** True iff a StandardMove is a capture (including en passant for diagonal pawn moves). */
function isMvCapture(state: GameState, mv: StandardMove): boolean {
  if (state.board[mv.to] !== null) return true;
  // En passant: pawn moves diagonally to the ep target square (which is empty)
  if (mv.to === state.enPassantTarget && (mv.from & 7) !== (mv.to & 7)) return true;
  return false;
}

/**
 * Compute check/mate/invasion suffix for the move that led to `stateAfter`.
 * The suffix is appended at the very end of the full SAN (after any rally).
 */
function checkSuffix(stateAfter: GameState): string {
  const status = gameStatus(stateAfter);
  if (status.type === 'win') {
    if (status.by === 'checkmate') return '#';
    if (status.by === 'invasion') return '##';
    return ''; // stalemate-loss: no suffix on the move
  }
  if (status.type !== 'ongoing') return '';
  const oppColor = stateAfter.sideToMove;
  const oppArmy = oppColor === 'W' ? stateAfter.armies.W : stateAfter.armies.B;
  const oppModel = getThreatModel(oppArmy);
  return oppModel.royalsInCheck(stateAfter, oppColor).length > 0 ? '+' : '';
}

/**
 * Compute the board after applying only the primary action (no rally).
 * Used to determine Warlord positions for rally disambiguation.
 */
function boardAfterPrimary(state: GameState, primary: PrimaryAction): (Piece | null)[] {
  const b = state.board.slice() as (Piece | null)[];
  const color = state.sideToMove;

  if (primary.type === 'standard') {
    const mv = primary as StandardMove;
    const piece = b[mv.from]!;
    b[mv.to] = mv.promotion ? { slot: mv.promotion, color: piece.color, promoted: true } : piece;
    b[mv.from] = null;
    if (piece.slot === 'P' && mv.to === state.enPassantTarget && (mv.from & 7) !== (mv.to & 7)) {
      b[color === 'W' ? mv.to - 8 : mv.to + 8] = null;
    }
    if (piece.slot === 'K' && Math.abs((mv.to & 7) - (mv.from & 7)) === 2) {
      const kingSide = (mv.to & 7) > (mv.from & 7);
      const rookRank = mv.from >> 3;
      const rookFrom = kingSide ? rookRank * 8 + 7 : rookRank * 8 + 0;
      const rookTo = kingSide ? rookRank * 8 + 5 : rookRank * 8 + 3;
      b[rookTo] = b[rookFrom];
      b[rookFrom] = null;
    }
  } else if (primary.type === 'shatter') {
    const sh = primary as Shatter;
    const wr = sh.warlordSquare >> 3, wf = sh.warlordSquare & 7;
    for (let dr = -1; dr <= 1; dr++) {
      for (let df = -1; df <= 1; df++) {
        if (dr === 0 && df === 0) continue;
        const r = wr + dr, f = wf + df;
        if (r < 0 || r > 7 || f < 0 || f > 7) continue;
        if (b[r * 8 + f]?.slot === 'K') continue; // royals are spared (RULES v2.2)
        b[r * 8 + f] = null;
      }
    }
  } else if (primary.type === 'rampage') {
    const rm = primary as RampageMove;
    const piece = b[rm.from]!;
    for (const capSq of rm.captures) b[capSq] = null;
    b[rm.from] = null;
    b[rm.to] = piece;
  } else if (primary.type === 'strike') {
    const sm = primary as StrikeMove;
    b[sm.target] = null;
  } else if (primary.type === 'teleport') {
    const tp = primary as TeleportMove;
    const piece = b[tp.from]!;
    b[tp.from] = null;
    b[tp.to] = piece;
  }
  return b;
}

/**
 * True iff a P-slot StandardMove is a "standard" pawn move expressible in
 * pawn notation (forward push 1/2, or diagonal capture including EP).
 * Thrall homing moves to non-forward or non-capture-diagonal squares return false.
 */
function isStandardPawnNotation(color: Color, mv: StandardMove, isCapture: boolean): boolean {
  const dir = color === 'W' ? 1 : -1;
  if (isCapture) return (mv.from & 7) !== (mv.to & 7); // diagonal capture (incl. EP)
  return mv.to === mv.from + dir * 8 || mv.to === mv.from + dir * 16; // forward push
}

/**
 * Disambiguation for non-standard P-slot moves (Thrall homing to non-push squares).
 * Competes only against other P-slot pieces making non-standard moves to the same square.
 */
function computePawnHomingDisambiguator(state: GameState, color: Color, from: Square, to: Square): string {
  const legal = legalTurns(state);
  const rivals: Square[] = [];
  for (const t of legal) {
    const p = t.primary;
    if (p.type !== 'standard' || p.from === from) continue;
    const piece = state.board[p.from];
    if (!piece || piece.slot !== 'P' || piece.color !== color) continue;
    if (p.to !== to) continue;
    // Skip if it's a standard pawn move (push or capture): rivals must be other homing moves
    if (isStandardPawnNotation(color, p, isMvCapture(state, p))) continue;
    rivals.push(p.from);
  }
  if (rivals.length === 0) return '';
  const fromFile = from & 7, fromRank = from >> 3;
  const sameFile = rivals.some(sq => (sq & 7) === fromFile);
  if (!sameFile) return fileChar(from);
  const sameRank = rivals.some(sq => (sq >> 3) === fromRank);
  if (!sameRank) return rankChar(from);
  return fileChar(from) + rankChar(from);
}

/**
 * Minimal FIDE disambiguator for a piece at `from` moving/striking to `to`.
 * `isCapture` is used to distinguish overloaded move types (e.g. Standard vs Strike).
 */
function computeDisambiguator(
  state: GameState, slot: Slot, from: Square, to: Square, isCapture: boolean
): string {
  const color = state.sideToMove;
  const legal = legalTurns(state);
  const competitors: Square[] = [];

  for (const t of legal) {
    const p = t.primary;
    let cFrom: Square | undefined;
    let cDest: Square | undefined;

    if (p.type === 'standard') {
      if (p.from === from) continue;
      const piece = state.board[p.from];
      if (!piece || piece.slot !== slot || piece.color !== color) continue;
      if (slot === 'K' && Math.abs((p.to & 7) - (p.from & 7)) === 2) continue; // castling
      if (isMvCapture(state, p) !== isCapture) continue;
      cFrom = p.from; cDest = p.to;
    } else if (p.type === 'teleport') {
      if (p.from === from) continue;
      const piece = state.board[p.from];
      if (!piece || piece.slot !== slot || piece.color !== color) continue;
      if (p.isCapture !== isCapture) continue;
      cFrom = p.from; cDest = p.to;
    } else if (p.type === 'rampage' && slot === 'R' && isCapture) {
      if (p.from === from) continue;
      const piece = state.board[p.from];
      if (!piece || piece.color !== color || piece.slot !== 'R') continue;
      cFrom = p.from; cDest = p.to;
    } else if (p.type === 'strike' && slot === 'B' && isCapture) {
      if (p.from === from) continue;
      const piece = state.board[p.from];
      if (!piece || piece.color !== color || piece.slot !== 'B') continue;
      cFrom = p.from; cDest = p.target;
    }

    if (cFrom !== undefined && cDest === to) competitors.push(cFrom);
  }

  if (competitors.length === 0) return '';
  const fromFile = from & 7, fromRank = from >> 3;
  const sameFile = competitors.some(sq => (sq & 7) === fromFile);
  const sameRank = competitors.some(sq => (sq >> 3) === fromRank);
  if (!sameFile) return fileChar(from);
  if (!sameRank) return rankChar(from);
  return fileChar(from) + rankChar(from);
}

/** Rally disambiguation against the mid-board (after primary, before rally). */
function computeRallyDisambiguator(
  midBoard: (Piece | null)[], rally: RallyStep, moverColor: Color
): string {
  const competitors: Square[] = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = midBoard[sq];
    if (!p || p.slot !== 'K' || p.color !== moverColor || sq === rally.from) continue;
    const dr = Math.abs((sq >> 3) - (rally.to >> 3));
    const df = Math.abs((sq & 7) - (rally.to & 7));
    if (dr <= 1 && df <= 1 && (dr !== 0 || df !== 0)) competitors.push(sq);
  }
  if (competitors.length === 0) return '';
  const fromFile = rally.from & 7, fromRank = rally.from >> 3;
  const sameFile = competitors.some(sq => (sq & 7) === fromFile);
  const sameRank = competitors.some(sq => (sq >> 3) === fromRank);
  if (!sameFile) return fileChar(rally.from);
  if (!sameRank) return rankChar(rally.from);
  return fileChar(rally.from) + rankChar(rally.from);
}

// ─── turnToSan ─────────────────────────────────────────────────────────────

export function turnToSan(stateBefore: GameState, turn: Turn): string {
  const primary = turn.primary;
  const color = stateBefore.sideToMove;
  const army = color === 'W' ? stateBefore.armies.W : stateBefore.armies.B;
  const stateAfter = applyTurnUnchecked(stateBefore, turn);
  const meta = stateAfter.lastTurnMeta;
  const suffix = checkSuffix(stateAfter);

  const essenceStr = (): string =>
    army === 'Veil' && meta?.essenceDelta
      ? `(E:${meta.essenceDelta.from}→${meta.essenceDelta.to})`
      : '';

  const rallyStr = (mid: (Piece | null)[]): string => {
    if (!turn.rally) return '';
    const dis = computeRallyDisambiguator(mid, turn.rally, color);
    return `;K${dis}${squareToAlgebraic(turn.rally.to)}`;
  };

  // ── Shatter ────────────────────────────────────────────────────────────
  if (primary.type === 'shatter') {
    const sh = primary as Shatter;
    const mid = boardAfterPrimary(stateBefore, primary);
    return `K@${squareToAlgebraic(sh.warlordSquare)}${rallyStr(mid)}${suffix}`;
  }

  // ── Standard move ──────────────────────────────────────────────────────
  if (primary.type === 'standard') {
    const mv = primary as StandardMove;
    const piece = stateBefore.board[mv.from]!;

    // Castling
    if (piece.slot === 'K' && Math.abs((mv.to & 7) - (mv.from & 7)) === 2) {
      return ((mv.to & 7) > (mv.from & 7) ? 'O-O' : 'O-O-O') + suffix;
    }

    const isCapture = isMvCapture(stateBefore, mv);
    let san: string;

    if (piece.slot === 'P') {
      if (!isStandardPawnNotation(color, mv, isCapture)) {
        // Thrall homing move: non-push, non-diagonal-capture. Use P-prefix notation.
        const dis = computePawnHomingDisambiguator(stateBefore, color, mv.from, mv.to);
        san = `P${dis}${squareToAlgebraic(mv.to)}`;
      } else if (isCapture) {
        san = `${fileChar(mv.from)}x${squareToAlgebraic(mv.to)}`;
      } else {
        san = squareToAlgebraic(mv.to);
      }
      if (mv.promotion) san += `=^${mv.promotion}`;
    } else {
      const dis = computeDisambiguator(stateBefore, piece.slot, mv.from, mv.to, isCapture);
      san = `${piece.slot}${dis}${isCapture ? 'x' : ''}${squareToAlgebraic(mv.to)}`;
    }

    const mid = boardAfterPrimary(stateBefore, primary);
    return san + essenceStr() + rallyStr(mid) + suffix;
  }

  // ── Teleport ───────────────────────────────────────────────────────────
  if (primary.type === 'teleport') {
    const tp = primary as TeleportMove;
    const piece = stateBefore.board[tp.from]!;
    const dis = computeDisambiguator(stateBefore, piece.slot, tp.from, tp.to, tp.isCapture);
    const san = `${piece.slot}${dis}${tp.isCapture ? 'x' : ''}${squareToAlgebraic(tp.to)}`;
    return san + essenceStr() + suffix;
  }

  // ── Rampage ────────────────────────────────────────────────────────────
  if (primary.type === 'rampage') {
    const rm = primary as RampageMove;
    const dis = computeDisambiguator(stateBefore, 'R', rm.from, rm.to, true);
    return `R${dis}x${squareToAlgebraic(rm.to)}${suffix}`;
  }

  // ── Strike ─────────────────────────────────────────────────────────────
  if (primary.type === 'strike') {
    const sm = primary as StrikeMove;
    const dis = computeDisambiguator(stateBefore, 'B', sm.from, sm.target, true);
    return `B${dis}x${squareToAlgebraic(sm.target)}~${suffix}`;
  }

  return '?';
}

// ─── sanToTurn helpers ─────────────────────────────────────────────────────

interface RallyInfo {
  to: Square;
  disambigFile: number | null;
  disambigRank: number | null;
}

function parseRallySan(raw: string): RallyInfo | ParseError {
  // Strip check/mate suffixes that may appear after the rally square
  const s = raw.replace(/##/g, '').replace(/[#+]/g, '').trim();
  if (!s.startsWith('K')) return { error: `Rally must start with 'K': ${raw}` };
  const rest = s.slice(1);
  if (rest.length < 2) return { error: `Invalid rally SAN: ${raw}` };
  const destStr = rest.slice(-2);
  if (!/^[a-h][1-8]$/.test(destStr)) return { error: `Invalid rally destination: ${raw}` };
  const to = algebraicToSquare(destStr);
  const disambigStr = rest.slice(0, -2);
  let disambigFile: number | null = null;
  let disambigRank: number | null = null;
  for (const ch of disambigStr) {
    if (/^[a-h]$/.test(ch)) disambigFile = ch.charCodeAt(0) - 97;
    else if (/^[1-8]$/.test(ch)) disambigRank = parseInt(ch) - 1;
    else return { error: `Invalid rally disambiguator '${ch}' in: ${raw}` };
  }
  return { to, disambigFile, disambigRank };
}

function matchRally(turnRally: RallyStep | undefined, info: RallyInfo | undefined): boolean {
  if (info === undefined) return turnRally === undefined;
  if (turnRally === undefined) return false;
  if (turnRally.to !== info.to) return false;
  if (info.disambigFile !== null && (turnRally.from & 7) !== info.disambigFile) return false;
  if (info.disambigRank !== null && (turnRally.from >> 3) !== info.disambigRank) return false;
  return true;
}

// ─── sanToTurn ─────────────────────────────────────────────────────────────

export function sanToTurn(state: GameState, san: string): Turn | ParseError {
  const color = state.sideToMove;

  // Split off the rally part (Twins: ';K...')
  let primarySan = san;
  let rallySan: string | undefined;
  const semiIdx = san.indexOf(';');
  if (semiIdx !== -1) {
    primarySan = san.slice(0, semiIdx);
    rallySan = san.slice(semiIdx + 1);
  }

  // Normalise primary: strip annotations and check/mate suffixes.
  // Keep the letter casing; strip: (E:n→m)  ~  *  ##  #  +
  let s = primarySan
    .replace(/\(E:\d+→\d+\)/g, '')
    .replace(/[~*]/g, '')
    .replace(/##/g, '')
    .replace(/[#+]/g, '')
    .trim();

  // Parse rally
  let rallyInfo: RallyInfo | undefined;
  if (rallySan !== undefined) {
    const r = parseRallySan(rallySan.trim());
    if (isParseError(r)) return r;
    rallyInfo = r;
  }

  const legal = legalTurns(state);

  // ── Castling ────────────────────────────────────────────────────────────
  if (s === 'O-O-O' || s === 'O-O') {
    const kingSide = s === 'O-O';
    const matches = legal.filter(t => {
      if (t.primary.type !== 'standard') return false;
      const mv = t.primary as StandardMove;
      const piece = state.board[mv.from];
      if (!piece || piece.slot !== 'K') return false;
      if (Math.abs((mv.to & 7) - (mv.from & 7)) !== 2) return false;
      return ((mv.to & 7) > (mv.from & 7)) === kingSide;
    });
    if (matches.length === 0) return { error: `Illegal castling: ${san}` };
    return matches[0];
  }

  // ── Shatter ────────────────────────────────────────────────────────────
  if (s.startsWith('K@')) {
    const sqStr = s.slice(2, 4);
    if (!/^[a-h][1-8]$/.test(sqStr)) return { error: `Invalid Shatter square: ${san}` };
    const warlordSq = algebraicToSquare(sqStr);
    const matches = legal.filter(t => {
      if (t.primary.type !== 'shatter') return false;
      const sh = t.primary as Shatter;
      return sh.warlordSquare === warlordSq && matchRally(t.rally, rallyInfo);
    });
    if (matches.length === 0) return { error: `Illegal Shatter: ${san}` };
    if (matches.length > 1) return { error: `Ambiguous Shatter: ${san}` };
    return matches[0];
  }

  // ── Non-standard pawn move (Thrall homing): P[a-h]?[1-8]?[a-h][1-8](=^[QRBN])? ──
  const pawnHomingM = s.match(/^P([a-h])?([1-8])?([a-h][1-8])(=\^([QRBN]))?$/);
  if (pawnHomingM) {
    const dfChar = pawnHomingM[1];
    const drChar = pawnHomingM[2];
    const to = algebraicToSquare(pawnHomingM[3]);
    const promo = pawnHomingM[5] as Slot | undefined;
    const disambigFile = dfChar !== undefined ? dfChar.charCodeAt(0) - 97 : null;
    const disambigRank = drChar !== undefined ? parseInt(drChar) - 1 : null;
    const dir = color === 'W' ? 1 : -1;
    const matches = legal.filter(t => {
      if (!matchRally(t.rally, rallyInfo)) return false;
      const p = t.primary;
      if (p.type !== 'standard') return false;
      const mv = p as StandardMove;
      const piece = state.board[mv.from];
      if (!piece || piece.slot !== 'P' || piece.color !== color) return false;
      if (mv.to !== to) return false;
      // Must be a non-standard pawn move (not push, not capture)
      if (isMvCapture(state, mv)) return false;
      if (mv.to === mv.from + dir * 8 || mv.to === mv.from + dir * 16) return false;
      if (promo !== undefined ? mv.promotion !== promo : mv.promotion !== undefined) return false;
      if (disambigFile !== null && (mv.from & 7) !== disambigFile) return false;
      if (disambigRank !== null && (mv.from >> 3) !== disambigRank) return false;
      return true;
    });
    if (matches.length === 0) return { error: `Illegal pawn homing move: ${san}` };
    if (matches.length > 1) {
      const froms = matches.map(t => squareToAlgebraic((t.primary as StandardMove).from)).join(', ');
      return { error: `Ambiguous pawn homing (add disambiguator): ${san} — pieces at: ${froms}` };
    }
    return matches[0];
  }

  // ── Pawn push: [a-h][1-8] or [a-h][1-8]=^[QRBN] ───────────────────────
  const pawnPushM = s.match(/^([a-h])([1-8])(=\^([QRBN]))?$/);
  if (pawnPushM) {
    const to = algebraicToSquare(pawnPushM[1] + pawnPushM[2]);
    const promo = pawnPushM[4] as Slot | undefined;
    const matches = legal.filter(t => {
      if (t.primary.type !== 'standard') return false;
      const mv = t.primary as StandardMove;
      const piece = state.board[mv.from];
      if (!piece || piece.slot !== 'P' || piece.color !== color) return false;
      if (mv.to !== to) return false;
      // Pawn push: same file, non-capture
      if ((mv.from & 7) !== (mv.to & 7)) return false;
      if (state.board[mv.to] !== null) return false;
      if (promo !== undefined ? mv.promotion !== promo : mv.promotion !== undefined) return false;
      return matchRally(t.rally, rallyInfo);
    });
    if (matches.length === 0) return { error: `Illegal pawn push: ${san}` };
    if (matches.length > 1) return { error: `Ambiguous pawn push: ${san}` };
    return matches[0];
  }

  // ── Pawn capture: [a-h]x[a-h][1-8] or with =^[QRBN] ───────────────────
  const pawnCapM = s.match(/^([a-h])x([a-h][1-8])(=\^([QRBN]))?$/);
  if (pawnCapM) {
    const fromFile = pawnCapM[1].charCodeAt(0) - 97;
    const to = algebraicToSquare(pawnCapM[2]);
    const promo = pawnCapM[4] as Slot | undefined;
    const matches = legal.filter(t => {
      if (t.primary.type !== 'standard') return false;
      const mv = t.primary as StandardMove;
      const piece = state.board[mv.from];
      if (!piece || piece.slot !== 'P' || piece.color !== color) return false;
      if (mv.to !== to) return false;
      if ((mv.from & 7) !== fromFile) return false;
      if (!isMvCapture(state, mv)) return false;
      if (promo !== undefined ? mv.promotion !== promo : mv.promotion !== undefined) return false;
      return matchRally(t.rally, rallyInfo);
    });
    if (matches.length === 0) return { error: `Illegal pawn capture: ${san}` };
    if (matches.length > 1) return { error: `Ambiguous pawn capture: ${san}` };
    return matches[0];
  }

  // ── Piece move ──────────────────────────────────────────────────────────
  // [KQRBN] [a-h]? [1-8]? x? [a-h][1-8] (=^[QRBN])?
  const pieceM = s.match(/^([KQRBN])([a-h])?([1-8])?(x)?([a-h][1-8])(=\^([QRBN]))?$/);
  if (pieceM) {
    const slot = pieceM[1] as Slot;
    const dfChar = pieceM[2];
    const drChar = pieceM[3];
    const isCapture = pieceM[4] === 'x';
    const to = algebraicToSquare(pieceM[5]);
    const promo = pieceM[7] as Slot | undefined;
    const disambigFile = dfChar !== undefined ? dfChar.charCodeAt(0) - 97 : null;
    const disambigRank = drChar !== undefined ? parseInt(drChar) - 1 : null;

    const matches = legal.filter(t => {
      const p = t.primary;
      if (!matchRally(t.rally, rallyInfo)) return false;

      if (p.type === 'standard') {
        const mv = p as StandardMove;
        const piece = state.board[mv.from];
        if (!piece || piece.slot !== slot || piece.color !== color) return false;
        if (slot === 'K' && Math.abs((mv.to & 7) - (mv.from & 7)) === 2) return false;
        if (mv.to !== to) return false;
        if (isMvCapture(state, mv) !== isCapture) return false;
        if (promo !== undefined ? mv.promotion !== promo : mv.promotion !== undefined) return false;
        if (disambigFile !== null && (mv.from & 7) !== disambigFile) return false;
        if (disambigRank !== null && (mv.from >> 3) !== disambigRank) return false;
        return true;
      }

      if (p.type === 'teleport') {
        const tp = p as TeleportMove;
        const piece = state.board[tp.from];
        if (!piece || piece.slot !== slot || piece.color !== color) return false;
        if (tp.to !== to) return false;
        if (tp.isCapture !== isCapture) return false;
        if (disambigFile !== null && (tp.from & 7) !== disambigFile) return false;
        if (disambigRank !== null && (tp.from >> 3) !== disambigRank) return false;
        return true;
      }

      if (p.type === 'rampage' && slot === 'R' && isCapture) {
        const rm = p as RampageMove;
        const piece = state.board[rm.from];
        if (!piece || piece.color !== color || piece.slot !== 'R') return false;
        if (rm.to !== to) return false;
        if (disambigFile !== null && (rm.from & 7) !== disambigFile) return false;
        if (disambigRank !== null && (rm.from >> 3) !== disambigRank) return false;
        return true;
      }

      if (p.type === 'strike' && slot === 'B' && isCapture) {
        const sm = p as StrikeMove;
        const piece = state.board[sm.from];
        if (!piece || piece.color !== color || piece.slot !== 'B') return false;
        if (sm.target !== to) return false;
        if (disambigFile !== null && (sm.from & 7) !== disambigFile) return false;
        if (disambigRank !== null && (sm.from >> 3) !== disambigRank) return false;
        return true;
      }

      return false;
    });

    if (matches.length === 0) return { error: `Illegal move: ${san}` };
    if (matches.length > 1) {
      const froms = matches.map(t => {
        const p = t.primary;
        if (p.type === 'standard') return squareToAlgebraic((p as StandardMove).from);
        if (p.type === 'teleport') return squareToAlgebraic((p as TeleportMove).from);
        if (p.type === 'rampage') return squareToAlgebraic((p as RampageMove).from);
        if (p.type === 'strike') return squareToAlgebraic((p as StrikeMove).from);
        return '?';
      }).join(', ');
      return { error: `Ambiguous SAN (add disambiguator): ${san} — pieces at: ${froms}` };
    }
    return matches[0];
  }

  return { error: `Cannot parse SAN: ${san}` };
}

// ─── Game record serialisation ─────────────────────────────────────────────

export function serializeGame(record: GameRecord): string {
  const lines: string[] = [`W=${record.armies.W} B=${record.armies.B}`];
  for (let i = 0; i < record.moves.length; i++) {
    const { white, black } = record.moves[i];
    const n = i + 1;
    lines.push(black !== undefined ? `${n}. ${white} ${black}` : `${n}. ${white}`);
  }
  if (record.result !== undefined) lines.push(record.result);
  return lines.join('\n');
}

export function parseGame(text: string): GameRecord | ParseError {
  const validArmies: Army[] = ['Crown', 'Phantom', 'Accord', 'Twins', 'Veil', 'Wild'];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  let armies: { W: Army; B: Army } | undefined;
  const moves: Array<{ white: string; black?: string }> = [];
  let result: GameRecord['result'];

  for (const line of lines) {
    if (line === '1-0' || line === '0-1' || line === '½-½' || line === '(=loss)') {
      result = line as GameRecord['result'];
      continue;
    }
    // Army declaration: optional "N. " prefix
    const armyM = line.match(/^(?:\d+\.\s+)?W=(\w+)\s+B=(\w+)$/);
    if (armyM) {
      const wA = armyM[1] as Army, bA = armyM[2] as Army;
      if (!validArmies.includes(wA)) return { error: `Unknown army: ${wA}` };
      if (!validArmies.includes(bA)) return { error: `Unknown army: ${bA}` };
      armies = { W: wA, B: bA };
      continue;
    }
    // Move line: "N. white [black]"
    const moveM = line.match(/^(\d+)\.\s+(.+)$/);
    if (moveM) {
      const tokens = moveM[2].split(/\s+/);
      moves.push({ white: tokens[0], black: tokens[1] });
    }
  }

  if (!armies) return { error: 'Missing army declaration (W=... B=...)' };
  return { armies, moves, result };
}

// ─── replayGame ────────────────────────────────────────────────────────────

export function replayGame(record: GameRecord): { finalState: GameState } | ReplayError {
  let state = initialState(record.armies.W, record.armies.B);

  for (let i = 0; i < record.moves.length; i++) {
    const moveNum = i + 1;
    const { white, black } = record.moves[i];

    const wt = sanToTurn(state, white);
    if (isParseError(wt)) return { moveNumber: moveNum, side: 'W', san: white, reason: wt.error };
    state = applyTurnUnchecked(state, wt);

    if (black !== undefined) {
      const bt = sanToTurn(state, black);
      if (isParseError(bt)) return { moveNumber: moveNum, side: 'B', san: black, reason: bt.error };
      state = applyTurnUnchecked(state, bt);
    }
  }

  // Validate result token if present
  if (record.result !== undefined) {
    const status = gameStatus(state);
    if (status.type !== 'ongoing') {
      const expected: string = status.type === 'draw' ? '½-½'
        : status.by === 'stalemate-loss' ? '(=loss)'
        : status.winner === 'W' ? '1-0' : '0-1';
      if (record.result !== expected) {
        return {
          moveNumber: record.moves.length,
          side: state.sideToMove,
          san: '',
          reason: `Result token '${record.result}' contradicts actual outcome '${expected}'`,
        };
      }
    }
  }

  return { finalState: state };
}
