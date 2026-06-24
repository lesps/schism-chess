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
  RampageMove,
  StrikeMove,
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

export { registerGenerator, fideGenerator, availablePromotions } from './movegen';
export { THRALL_HOMING_TWINS } from './phantom';

// Army registrations (side-effect imports)
import './phantom';
import './veil';
import './accord';
import './twins';
import './wild';

export { legalTurns, applyTurn } from './legality';
export { applyTurnUnchecked } from './apply';

export type { GameStatus } from './status';
export { gameStatus } from './status';

export type { ParseError, ReplayError, GameRecord } from './notation';
export {
  isParseError,
  turnToSan,
  sanToTurn,
  serializeGame,
  parseGame,
  replayGame,
} from './notation';
