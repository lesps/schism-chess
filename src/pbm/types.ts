import type { Army, Color, GameState } from '../engine/index';
import type { GameRecord } from '../engine/notation';

export type Phase = 'commit' | 'reveal' | 'play' | 'finished';

export type PayloadResult = '1-0' | '0-1' | '1/2-1/2';

export interface Hasher {
  sha256(s: string): Promise<string>;
}

export interface PBMPayload {
  readonly v: 1;
  readonly gameId: string;
  readonly phase: Phase;
  readonly white: { readonly label: string };
  readonly black: { readonly label: string };
  readonly commit: { readonly by: Color; readonly hash: string };
  readonly armies: { readonly W?: Army; readonly B?: Army };
  readonly reveal?: { readonly army: Army; readonly salt: string };
  readonly moves: readonly string[];
  readonly result: PayloadResult | null;
}

export type ValidationError =
  | { type: 'newer-client'; message: string }
  | { type: 'schema'; message: string }
  | { type: 'hash-mismatch'; message: string }
  | { type: 'replay'; moveNumber: number; side: Color; san: string; reason: string }
  | { type: 'result-mismatch'; message: string };

export interface ValidationSuccess {
  ok: true;
  phase: Phase;
  state: GameState | undefined;
  record: GameRecord | undefined;
  whoseTurn: Color;
}

export interface ValidationFailure {
  ok: false;
  error: ValidationError;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;
