export type {
  Square,
  Color,
  Army,
  Slot,
  Piece,
  GameState,
  Turn,
  PrimaryAction,
  StandardMove,
  TeleportMove,
  Shatter,
  RallyStep,
} from './types';

export { initialState } from './positions';

export {
  serializeSfen,
  parseSfen,
  squareToAlgebraic,
  algebraicToSquare,
} from './sfen';

export { positionKey } from './positionKey';

export type { ThreatModel } from './threat';
export { registerThreatModel, getThreatModel, fideThreatModel } from './threat';

export { registerGenerator, fideGenerator } from './movegen';

// Army registrations (side-effect imports)
import './phantom';
import './veil';

export { legalTurns, applyTurn } from './legality';
export { applyTurnUnchecked } from './apply';

export type { GameStatus } from './status';
export { gameStatus } from './status';
