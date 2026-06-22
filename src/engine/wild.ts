import type { Color, GameState, Slot, Square, Turn } from './types';
import type { ThreatModel } from './threat';
import { getThreatModel, registerThreatModel } from './threat';
import { registerGenerator, availablePromotions } from './movegen';

const ORTHO_DIRS = [[-1,0],[1,0],[0,-1],[0,1]] as const;
const DIAG_DIRS  = [[-1,-1],[-1,1],[1,-1],[1,1]] as const;
const KNIGHT_JUMPS = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]] as const;

// Resolved ruling for rampage vs an out-of-range enemy Behemoth.
// 'wall': the armored Behemoth truncates the rampage at the square before it
//         (pieces before it are still captured; it and squares beyond it are untouched).
// 'illegal-move' (alternative): any rampage that would reach an out-of-range enemy Behemoth
//         is wholly illegal instead.
const RAMPAGE_VS_ARMOR = 'wall' as const;

function chebyshev(a: Square, b: Square): number {
  return Math.max(Math.abs((a >> 3) - (b >> 3)), Math.abs((a & 7) - (b & 7)));
}

function pushStd(turns: Turn[], from: Square, to: Square, promo?: Slot): void {
  const mv: { type: 'standard'; from: Square; to: Square; promotion?: Slot } =
    { type: 'standard', from, to };
  if (promo !== undefined) mv.promotion = promo;
  turns.push({ primary: mv });
}

// Apex (Q-slot): chancellor — Rook slides OR Knight jumps. Captures normally (enemy only).
function addApexMoves(state: GameState, from: Square, color: Color, turns: Turn[]): void {
  const board = state.board;
  const rank = from >> 3, file = from & 7;

  for (const [dr, df] of ORTHO_DIRS) {
    let r = rank + dr, f = file + df;
    while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
      const to = r * 8 + f;
      const tp = board[to];
      if (tp) {
        if (tp.color !== color) pushStd(turns, from, to);
        break;
      }
      pushStd(turns, from, to);
      r += dr; f += df;
    }
  }

  for (const [dr, df] of KNIGHT_JUMPS) {
    const r = rank + dr, f = file + df;
    if (r < 0 || r > 7 || f < 0 || f > 7) continue;
    const to = r * 8 + f;
    const tp = board[to];
    if (tp && tp.color === color) continue;
    pushStd(turns, from, to);
  }
}

// Behemoth (R-slot): up to 3 squares orthogonally; may capture friendly pieces (not royals).
// Rampage: on ANY capture the Behemoth must continue to maximum distance (3 from origin or
// board edge), capturing every piece in its path (friendly and enemy). Stops before an
// out-of-range enemy Behemoth when RAMPAGE_VS_ARMOR='wall'. Illegal if path crosses a
// friendly royal.
function addBehemothMoves(state: GameState, from: Square, color: Color, turns: Turn[]): void {
  const board = state.board;
  const rank = from >> 3, file = from & 7;

  for (const [dr, df] of ORTHO_DIRS) {
    // Build path: up to 3 squares in this direction, within board
    const path: Square[] = [];
    let r = rank + dr, f2 = file + df;
    while (r >= 0 && r <= 7 && f2 >= 0 && f2 <= 7 && path.length < 3) {
      path.push(r * 8 + f2);
      r += dr; f2 += df;
    }
    if (path.length === 0) continue;

    // Find first occupied square
    let firstPieceIdx = -1;
    for (let i = 0; i < path.length; i++) {
      if (board[path[i]] !== null) { firstPieceIdx = i; break; }
    }

    // Non-capture moves: all empty squares before the first piece
    const nonCapEnd = firstPieceIdx === -1 ? path.length : firstPieceIdx;
    for (let i = 0; i < nonCapEnd; i++) {
      pushStd(turns, from, path[i]);
    }

    if (firstPieceIdx === -1) continue; // all empty — only non-capture moves in this direction

    // Rampage: go to maximum distance from firstPieceIdx onward.
    // Collect captures, apply armor-wall truncation and friendly-royal exclusion.
    const captures: Square[] = [];
    let rampageEnd = path.length - 1; // default: go to end of path
    let illegal = false;

    for (let i = firstPieceIdx; i < path.length; i++) {
      const sq = path[i];
      const p = board[sq];
      if (p === null) continue; // empty square inside rampage — pass through

      // Friendly royal: whole rampage illegal
      if (p.color === color && p.slot === 'K') { illegal = true; break; }

      // Enemy armored Behemoth (wall ruling): stop BEFORE this square
      if (p.color !== color && p.slot === 'R' && !p.promoted && RAMPAGE_VS_ARMOR === 'wall' && chebyshev(from, sq) > 2) {
        if (i === firstPieceIdx) {
          // The very first capture-entry is a wall — no valid rampage
          illegal = true;
        } else {
          // Stop one square before the wall
          rampageEnd = i - 1;
        }
        break;
      }

      captures.push(sq);
    }

    if (illegal) continue;

    turns.push({ primary: { type: 'rampage', from, to: path[rampageEnd], captures } });
  }
}

// Stalker (B-slot): up to 2 squares diagonally. Non-capture moves are normal.
// Capture = Strike-and-Return: target removed, Stalker stays at `from`. Produces StrikeMove.
// Exhausted Stalkers (square in state.exhausted) may not capture this turn.
function addStalkerMoves(state: GameState, from: Square, color: Color, turns: Turn[]): void {
  const board = state.board;
  const rank = from >> 3, file = from & 7;
  const isExhausted = state.exhausted.includes(from);

  for (const [dr, df] of DIAG_DIRS) {
    let r = rank + dr, f2 = file + df;
    let steps = 0;
    while (r >= 0 && r <= 7 && f2 >= 0 && f2 <= 7 && steps < 2) {
      const to = r * 8 + f2;
      const tp = board[to];
      if (tp) {
        if (tp.color !== color && !isExhausted) {
          // Strike and Return: capture target, Stalker stays at from
          turns.push({ primary: { type: 'strike', from, target: to } });
        }
        break; // blocked — cannot pass through pieces
      }
      pushStd(turns, from, to); // non-capture diagonal move
      r += dr; f2 += df;
      steps++;
    }
  }
}

// Bronco (N-slot): standard Knight; may capture friendly pieces but never own royal (K-slot).
function addBroncoMoves(state: GameState, from: Square, color: Color, turns: Turn[]): void {
  const board = state.board;
  const rank = from >> 3, file = from & 7;

  for (const [dr, df] of KNIGHT_JUMPS) {
    const r = rank + dr, f = file + df;
    if (r < 0 || r > 7 || f < 0 || f > 7) continue;
    const to = r * 8 + f;
    const tp = board[to];
    if (tp && tp.color === color && tp.slot === 'K') continue; // never capture own royal
    pushStd(turns, from, to);
  }
}

// FIDE move helpers for promoted pieces (no army-specific abilities).
function addFideQueenMoves(state: GameState, from: Square, color: Color, turns: Turn[]): void {
  const board = state.board;
  const rank = from >> 3, file = from & 7;
  for (const [dr, df] of [...ORTHO_DIRS, ...DIAG_DIRS] as const) {
    let r = rank + dr, f = file + df;
    while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
      const to = r * 8 + f;
      const tp = board[to];
      if (tp) {
        if (tp.color !== color) pushStd(turns, from, to);
        break;
      }
      pushStd(turns, from, to);
      r += dr; f += df;
    }
  }
}

function addFideRookMoves(state: GameState, from: Square, color: Color, turns: Turn[]): void {
  const board = state.board;
  const rank = from >> 3, file = from & 7;
  for (const [dr, df] of ORTHO_DIRS) {
    let r = rank + dr, f = file + df;
    while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
      const to = r * 8 + f;
      const tp = board[to];
      if (tp) {
        if (tp.color !== color) pushStd(turns, from, to);
        break;
      }
      pushStd(turns, from, to);
      r += dr; f += df;
    }
  }
}

function addFideBishopMoves(state: GameState, from: Square, color: Color, turns: Turn[]): void {
  const board = state.board;
  const rank = from >> 3, file = from & 7;
  for (const [dr, df] of DIAG_DIRS) {
    let r = rank + dr, f = file + df;
    while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
      const to = r * 8 + f;
      const tp = board[to];
      if (tp) {
        if (tp.color !== color) pushStd(turns, from, to);
        break;
      }
      pushStd(turns, from, to);
      r += dr; f += df;
    }
  }
}

function addFideKnightMoves(state: GameState, from: Square, color: Color, turns: Turn[]): void {
  const board = state.board;
  const rank = from >> 3, file = from & 7;
  for (const [dr, df] of KNIGHT_JUMPS) {
    const r = rank + dr, f = file + df;
    if (r < 0 || r > 7 || f < 0 || f > 7) continue;
    const to = r * 8 + f;
    const tp = board[to];
    if (tp && tp.color === color) continue; // no friendly captures
    pushStd(turns, from, to);
  }
}

function addKingMoves(state: GameState, from: Square, color: Color, turns: Turn[]): void {
  const rank = from >> 3, file = from & 7;
  for (let dr = -1; dr <= 1; dr++) {
    for (let df = -1; df <= 1; df++) {
      if (dr === 0 && df === 0) continue;
      const r = rank + dr, f = file + df;
      if (r < 0 || r > 7 || f < 0 || f > 7) continue;
      const to = r * 8 + f;
      const tp = state.board[to];
      if (tp && tp.color === color) continue;
      pushStd(turns, from, to);
    }
  }
}

function addPawnMoves(state: GameState, from: Square, color: Color, turns: Turn[]): void {
  const board = state.board;
  const rank = from >> 3, file = from & 7;
  const dir = color === 'W' ? 1 : -1;
  const startRank = color === 'W' ? 1 : 6;
  const promoRank = color === 'W' ? 7 : 0;

  const promos = availablePromotions(state, color);
  const push1 = from + dir * 8;
  if (push1 >= 0 && push1 < 64 && !board[push1]) {
    if ((push1 >> 3) === promoRank) {
      for (const p of promos) pushStd(turns, from, push1, p);
    } else {
      pushStd(turns, from, push1);
      if (rank === startRank) {
        const push2 = from + dir * 16;
        if (!board[push2]) pushStd(turns, from, push2);
      }
    }
  }

  for (const df of [-1, 1]) {
    const capFile = file + df;
    if (capFile < 0 || capFile > 7) continue;
    const capSq = (rank + dir) * 8 + capFile;
    const target = board[capSq];
    if (target && target.color !== color) {
      if ((capSq >> 3) === promoRank) {
        for (const p of promos) pushStd(turns, from, capSq, p);
      } else {
        pushStd(turns, from, capSq);
      }
    } else if (state.enPassantTarget === capSq) {
      pushStd(turns, from, capSq);
    }
  }
}

function wildGenerator(state: GameState): Turn[] {
  const turns: Turn[] = [];
  const color = state.sideToMove;
  const board = state.board;

  for (let from = 0; from < 64; from++) {
    const piece = board[from];
    if (!piece || piece.color !== color) continue;

    switch (piece.slot) {
      case 'K': addKingMoves(state, from, color, turns); break;
      case 'Q':
        if (piece.promoted) addFideQueenMoves(state, from, color, turns);
        else addApexMoves(state, from, color, turns);
        break;
      case 'R':
        if (piece.promoted) addFideRookMoves(state, from, color, turns);
        else addBehemothMoves(state, from, color, turns);
        break;
      case 'B':
        if (piece.promoted) addFideBishopMoves(state, from, color, turns);
        else addStalkerMoves(state, from, color, turns);
        break;
      case 'N':
        if (piece.promoted) addFideKnightMoves(state, from, color, turns);
        else addBroncoMoves(state, from, color, turns);
        break;
      case 'P': addPawnMoves(state, from, color, turns); break;
    }
  }

  return turns;
}

// ---------------------------------------------------------------------------
// Wild ThreatModel
// ---------------------------------------------------------------------------

function wildAttackedSquares(state: GameState, byColor: Color): Set<Square> {
  const attacked = new Set<Square>();
  const board = state.board;

  for (let from = 0; from < 64; from++) {
    const piece = board[from];
    if (!piece || piece.color !== byColor) continue;
    const rank = from >> 3, file = from & 7;

    switch (piece.slot) {
      case 'Q': {
        if (piece.promoted) {
          // Promoted FIDE Queen: diagonal + orthogonal slides
          for (const [dr, df] of [...ORTHO_DIRS, ...DIAG_DIRS] as const) {
            let r = rank + dr, f = file + df;
            while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
              attacked.add(r * 8 + f);
              if (board[r * 8 + f]) break;
              r += dr; f += df;
            }
          }
        } else {
          // Apex: orthogonal slides + knight jumps
          for (const [dr, df] of ORTHO_DIRS) {
            let r = rank + dr, f = file + df;
            while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
              attacked.add(r * 8 + f);
              if (board[r * 8 + f]) break;
              r += dr; f += df;
            }
          }
          for (const [dr, df] of KNIGHT_JUMPS) {
            const r = rank + dr, f = file + df;
            if (r >= 0 && r <= 7 && f >= 0 && f <= 7) attacked.add(r * 8 + f);
          }
        }
        break;
      }
      case 'R': {
        if (piece.promoted) {
          // Promoted FIDE Rook: standard orthogonal attacks
          for (const [dr, df] of ORTHO_DIRS) {
            let r = rank + dr, f = file + df;
            while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
              attacked.add(r * 8 + f);
              if (board[r * 8 + f]) break;
              r += dr; f += df;
            }
          }
        } else {
          // Behemoth: rampage-aware threat. Mark every square in the rampage run.
          // Continue through pieces (rampage captures them) EXCEPT:
          //   - Stop (don't add) at a friendly royal (rampage would be illegal)
          //   - Stop (don't add) before an out-of-range enemy Behemoth (armor wall)
          // Enemy royals are NOT blocking: their square is threatened (rampage check).
          for (const [dr, df] of ORTHO_DIRS) {
            let r = rank + dr, f = file + df;
            let steps = 0;
            while (r >= 0 && r <= 7 && f >= 0 && f <= 7 && steps < 3) {
              const sq = r * 8 + f;
              const p = board[sq];
              if (p) {
                // Friendly royal: rampage through this is illegal — stop without adding
                if (p.color === byColor && p.slot === 'K') break;
                // Enemy armored Behemoth (wall): stop BEFORE this square
                if (p.color !== byColor && p.slot === 'R' && !p.promoted && RAMPAGE_VS_ARMOR === 'wall' && chebyshev(from, sq) > 2) break;
                // Any other piece: mark attacked, rampage continues
                attacked.add(sq);
              } else {
                attacked.add(sq);
              }
              r += dr; f += df;
              steps++;
            }
          }
        }
        break;
      }
      case 'B': {
        if (piece.promoted) {
          // Promoted FIDE Bishop: full diagonal slides
          for (const [dr, df] of DIAG_DIRS) {
            let r = rank + dr, f = file + df;
            while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
              attacked.add(r * 8 + f);
              if (board[r * 8 + f]) break;
              r += dr; f += df;
            }
          }
        } else {
          // Stalker: exhausted Stalker contributes NO attacked squares (can't capture this turn).
          // State-aware: mirrors the same pattern as the 0-Essence Wraith.
          if (state.exhausted.includes(from)) break;
          for (const [dr, df] of DIAG_DIRS) {
            let r = rank + dr, f = file + df;
            let steps = 0;
            while (r >= 0 && r <= 7 && f >= 0 && f <= 7 && steps < 2) {
              const sq = r * 8 + f;
              attacked.add(sq);
              if (board[sq]) break; // blocked at first piece
              r += dr; f += df;
              steps++;
            }
          }
        }
        break;
      }
      case 'N': { // Bronco or promoted FIDE Knight: both have standard knight attacks
        for (const [dr, df] of KNIGHT_JUMPS) {
          const r = rank + dr, f = file + df;
          if (r >= 0 && r <= 7 && f >= 0 && f <= 7) attacked.add(r * 8 + f);
        }
        break;
      }
      case 'K': {
        for (let dr = -1; dr <= 1; dr++) {
          for (let df = -1; df <= 1; df++) {
            if (dr === 0 && df === 0) continue;
            const r = rank + dr, f = file + df;
            if (r >= 0 && r <= 7 && f >= 0 && f <= 7) attacked.add(r * 8 + f);
          }
        }
        break;
      }
      case 'P': {
        // Unified threat principle: blocked 7th-rank pawn → no diagonal threat.
        const seventhRank = byColor === 'W' ? 6 : 1;
        if (rank === seventhRank && availablePromotions(state, byColor).length === 0) break;
        const dir = byColor === 'W' ? 1 : -1;
        const r = rank + dir;
        if (r >= 0 && r <= 7) {
          if (file > 0) attacked.add(r * 8 + file - 1);
          if (file < 7) attacked.add(r * 8 + file + 1);
        }
        break;
      }
    }
  }

  return attacked;
}

const wildThreatModel: ThreatModel = {
  attackedSquares: wildAttackedSquares,

  royalsInCheck(state: GameState, color: Color): Square[] {
    const oppColor: Color = color === 'W' ? 'B' : 'W';
    const oppArmy = oppColor === 'W' ? state.armies.W : state.armies.B;
    const oppModel = getThreatModel(oppArmy);
    const attacked = oppModel.attackedSquares(state, oppColor);
    const result: Square[] = [];
    for (let sq = 0; sq < 64; sq++) {
      const p = state.board[sq];
      if (p && p.color === color && p.slot === 'K' && attacked.has(sq)) {
        result.push(sq);
      }
    }
    return result;
  },

  // Behemoth Armor: an enemy piece may capture a Behemoth (R-slot) only if it starts
  // within Chebyshev 2 of the Behemoth's square. Friendly captures bypass Armor.
  // Shatter is not routed through captureConstraints and always clears adjacent pieces.
  captureConstraints(state: GameState, capturerFrom: Square, targetSq: Square): boolean {
    const target = state.board[targetSq];
    if (!target || target.slot !== 'R' || target.promoted) return true; // only Behemoths have Armor
    const capturer = state.board[capturerFrom];
    if (capturer && capturer.color === target.color) return true; // friendly capture: no Armor
    return chebyshev(capturerFrom, targetSq) <= 2;
  },
};

registerGenerator('Wild', wildGenerator);
registerThreatModel('Wild', wildThreatModel);
