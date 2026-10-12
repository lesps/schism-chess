// In-game explanations of pieces: live notes about a piece in the current position,
// and a legend for the move markers its legal turns put on the board. Everything is
// read from the engine (legal turns, threat models, Banner/Concord, promotions) —
// the UI never decides legality itself.

import type { Army, Color, GameState, Slot, Square, Turn } from '../engine/types';
import { availablePromotions, getThreatModel, isPiercingCheck } from '../engine';
import { bannerZone, concordPool } from '../engine/accord';
import { getDestHighlight, getSlotName, hasCrossedMidline } from './shared';
import type { DestHighlightType } from './shared';

export interface LegendItem {
  kind: DestHighlightType;
  label: string;
}

/** Every piece type an army fields, in back-rank reading order. */
export function armyRoster(army: Army): Slot[] {
  return army === 'Twins' ? ['K', 'R', 'B', 'N', 'P'] : ['K', 'Q', 'R', 'B', 'N', 'P'];
}

function listWithOr(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

function listWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const POOL_ORDER: Slot[] = ['R', 'B', 'N'];

/**
 * Short, situation-specific notes for the piece on `sq` ("Essence 2/4 …", "In Concord —
 * also moves as a Rook", "Can promote to …"). `turnsForPiece` (its legal turns, when
 * it's that side's move) enables notes that depend on what it can do right now.
 */
export function pieceNotes(state: GameState, sq: Square, turnsForPiece: Turn[] = []): string[] {
  const piece = state.board[sq];
  if (!piece) return [];
  const { slot, color } = piece;
  const army = state.armies[color];
  const opp: Color = color === 'W' ? 'B' : 'W';
  const notes: string[] = [];

  // Royals: check and (Twins) midline progress
  if (slot === 'K') {
    if (getThreatModel(army).royalsInCheck(state, color).includes(sq)) notes.push('In check!');
    if (army === 'Twins' && hasCrossedMidline(sq, color)) {
      const both = state.board.every((p, s) =>
        !p || p.color !== color || p.slot !== 'K' || hasCrossedMidline(s, color));
      notes.push(both
        ? 'Both Warlords are past the midline — out of check, that is an invasion win.'
        : 'Past the midline — the other Warlord must cross too.');
    }
  }

  // Pawns: what they can become (Reinforcement: your army's own pieces, open slots only)
  if (slot === 'P') {
    const row = sq >> 3;
    const advanced = color === 'W' ? row >= 4 : row <= 3;
    if (advanced) {
      const promos = availablePromotions(state, color);
      if (promos.length === 0) {
        notes.push('Blocked: every piece type is at full strength, so it can’t step onto the last rank until one is lost.');
      } else {
        notes.push(`On the last rank it can promote to a ${listWithOr(promos.map(p => getSlotName(p, army)))}.`);
      }
    }
  }

  switch (army) {
    case 'Veil': {
      const essence = state.essence[color];
      if (slot === 'Q') {
        notes.push(essence > 0
          ? `Essence ${essence}/4 — it can capture (−1 each) and gives check.`
          : 'Essence 0/4 — it can’t capture or give check until a Bishop, Knight or pawn captures an enemy pawn.');
      } else if ((slot === 'B' || slot === 'N' || slot === 'P') && essence < 4) {
        notes.push(`Capturing an enemy pawn with it gives the Wraith +1 Essence (now ${essence}/4).`);
      }
      break;
    }
    case 'Wild':
      if (slot === 'B' && state.exhausted.includes(sq)) notes.push('Exhausted — it can move this turn but not capture.');
      if (slot === 'R') notes.push('Armor zone: while it’s selected, the tinted squares show where an enemy must stand to capture it.');
      break;
    case 'Accord': {
      const zone = bannerZone(state.board, color);
      if (slot === 'Q') {
        const inConcord = [...zone].filter(s => {
          const p = state.board[s];
          return p && p.color === color && (p.slot === 'R' || p.slot === 'B' || p.slot === 'N');
        }).length;
        if (concordPool(state.board, color).size >= 2) notes.push(`${inConcord} pieces in Concord around it.`);
        if (turnsForPiece.some(t => t.primary.type === 'march')) {
          notes.push('Can lead a March now — tap an empty square next to it, then choose March.');
        }
      } else if (slot === 'R' || slot === 'B' || slot === 'N') {
        if (zone.size === 0) {
          notes.push('The Herald has fallen — no Concord: it moves normally.');
        } else if (zone.has(sq)) {
          const others = POOL_ORDER.filter(s => s !== slot && concordPool(state.board, color).has(s));
          notes.push(others.length > 0
            ? `In Concord — also moves as a ${listWithAnd(others.map(s => getSlotName(s, army)))}.`
            : 'In the Banner, but alone — it gains nothing until a different Knight, Bishop or Rook joins.');
        }
      }
      break;
    }
    case 'Phantom':
      if (slot === 'Q' && state.sideToMove === opp && isPiercingCheck(state)) {
        notes.push('Giving piercing check — it can’t be blocked.');
      }
      break;
  }

  return notes;
}

/**
 * One entry per kind of marker this piece's legal turns put on the board, in a stable
 * order, so the player can read the dots and rings without memorizing colors.
 */
export function moveLegend(state: GameState, turns: Turn[]): LegendItem[] {
  const seen = new Map<string, LegendItem>();
  const mover = state.sideToMove;
  const army = state.armies[mover];
  for (const t of turns) {
    const kind = getDestHighlight(t, state.board, mover, army);
    let label: string;
    switch (t.primary.type) {
      case 'rampage': label = 'Rampage'; break;
      case 'strike':  label = 'Strike'; break;
      case 'march':   label = 'March'; break;
      case 'shatter': label = 'Shatter (tap it again)'; break;
      default:
        label = {
          'legal-move': 'Move',
          'legal-capture': 'Capture',
          'legal-special': 'Special',
          'legal-teleport-move': 'Teleport',
          'legal-teleport-capture': 'Teleport capture',
          'legal-homing': 'Homing step',
          'legal-friendly-capture': 'Takes your own piece',
          'legal-rally': 'Rally',
        }[kind];
    }
    if (!seen.has(label)) seen.set(label, { kind, label });
  }
  const order: DestHighlightType[] = [
    'legal-move', 'legal-homing', 'legal-teleport-move', 'legal-capture',
    'legal-teleport-capture', 'legal-friendly-capture', 'legal-special', 'legal-rally',
  ];
  return [...seen.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}
