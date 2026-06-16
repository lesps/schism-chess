# Schism Chess

## Commands

```
npm run dev        # Vite dev server
npm run build      # TypeScript check + Vite build (for deployment)
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint over src/ and tests/
npm run test       # Vitest (all suites)
```

## Layout

```
src/engine/    # Pure TS — no React/DOM/browser imports ever
src/pbm/       # Pure TS — play-by-post logic (placeholder)
src/ui/        # React components
src/app/       # App wiring (main.tsx entry point)
tests/         # Mirrors src/ structure
docs/          # RULES.md (canonical ruleset, v2.0.1)
```

## Engine Purity Rule

`src/engine/` and `src/pbm/` must **never** import from `react`, `react-dom`, `vite`, or any browser globals. Enforced two ways:
1. ESLint `no-restricted-imports` rule in `eslint.config.js`
2. Filesystem grep test in `tests/engine/purity.test.ts`

Both must stay green.

## Tests Are the Spec

Unit tests define expected behavior. When tests and prose diverge, fix the prose (or open an issue). The human-readable ruleset is at `docs/RULES.md` — treat it as canonical for game rules; treat tests as canonical for engine behavior.

## Square Encoding

`type Square = number` (0–63).  
`index = rank * 8 + file`. Rank 0 = White's 1st rank. File 0 = a-file.  
`a1 = 0`, `h1 = 7`, `a2 = 8`, …, `h8 = 63`.

## Turn Atomicity (Twins)

`Turn = { primary: PrimaryAction; rally?: RallyStep }`. The Twins' normal-move + Rally is one atomic unit. All legality is evaluated per-Turn (not per sub-move), so `RallyStep` lives on `Turn` rather than being a separate action. This is load-bearing for the one-action-per-check rule in RULES.md §4.

## SFEN-X Format

16 `/`-separated tokens: `<r8>/<r7>/…/<r1>/<side>/<armyW,armyB>/<castling>/<ep>/<essW,essB>/<exhausted>/<halfmove>/<fullmove>`

Board letters = slot (K Q R B N P), uppercase=White, lowercase=Black. `positionKeys` is **not** serialized (it's derivable from a game record).

## Project Status

Done: S1 (types, starting positions, SFEN-X, position keys, CI scaffold)  
Done: S2 (legality kernel + Crown complete, FIDE perft-verified at depth 1/2/3)  
Done: S3 (Phantom army: piercing Shade, homing Thralls, checkResponseConstraint wiring)  
Done: S4 (Veil army: Essence-gated Wraith slide/teleport, teleport Wisps, Essence accounting)

**Exported API** (next session can rely on all of these from `src/engine/index.ts`):

| Export | Module |
|--------|--------|
| `initialState(armyW, armyB): GameState` | `positions.ts` |
| `serializeSfen(state): string` | `sfen.ts` |
| `parseSfen(s): GameState` | `sfen.ts` |
| `squareToAlgebraic(sq): string` | `sfen.ts` |
| `algebraicToSquare(s): Square` | `sfen.ts` |
| `positionKey(state): string` | `positionKey.ts` |
| `legalTurns(state): Turn[]` | `legality.ts` |
| `applyTurn(state, turn): GameState` | `legality.ts` |
| `applyTurnUnchecked(state, turn): GameState` | `apply.ts` |
| `gameStatus(state): GameStatus` | `status.ts` |
| `registerThreatModel(army, model)` | `threat.ts` |
| `getThreatModel(army): ThreatModel` | `threat.ts` |
| `registerGenerator(army, gen)` | `movegen.ts` |
| `fideGenerator` | `movegen.ts` |
| `THRALL_HOMING_TWINS` | `phantom.ts` |
| `ThreatModel` (interface) | `threat.ts` |
| `GameStatus` (type) | `status.ts` |
| `Square`, `Color`, `Army`, `Slot` | `types.ts` |
| `Piece`, `GameState` | `types.ts` |
| `Turn`, `PrimaryAction` | `types.ts` |
| `StandardMove`, `TeleportMove`, `Shatter`, `RallyStep` | `types.ts` |

## Kernel API (frozen — army sessions extend via registries only)

Pipeline: `legalTurns` → pseudo-legal generation via army generator → filter by no-self-check → castling through/from-check filter → captureConstraints veto (target army) → checkResponseConstraint (opponent army, if mover in check).

**To add a new army:** register a `MoveGenerator` and a `ThreatModel` — no pipeline edits needed.

```ts
// In your army module (e.g. src/engine/phantom.ts):
import { registerGenerator, registerThreatModel } from './legality'; // or './movegen'/'./threat'

registerGenerator('Phantom', phantomGenerator);
registerThreatModel('Phantom', phantomThreatModel);
```

Then import the module in `index.ts` for the side-effect registration.

### ThreatModel interface

```ts
interface ThreatModel {
  attackedSquares(state, byColor): Set<Square>;   // squares pieces of byColor attack
  royalsInCheck(state, color): Square[];           // royal squares of color that are in check
  checkResponseConstraint?(state, turn): boolean;  // veto on check responses (Phantom Shade)
  captureConstraints?(state, capturerFrom, sq): boolean; // veto on captures targeting this army
}
```

### GameStatus type

```ts
type GameStatus =
  | { type: 'ongoing' }
  | { type: 'win'; by: 'checkmate' | 'invasion' | 'stalemate-loss'; winner: Color }
  | { type: 'draw'; by: 'threefold' | 'fifty-move' | 'material' };
```

Invasion: White wins when king reaches row index 4 (rank 5); Black wins on row index 3 (rank 4).  
Stalemate = loss for the stalemated side.  
Insufficient-material draw stub returns false (full detection in S8).

## positionKeys convention

`applyTurnUnchecked` appends the resulting position's key to `positionKeys`.  
Threefold draw triggers when the current key appears ≥ 3 times in `positionKeys`.  
Initial position is not pre-populated; if you need it counted start the game with `positionKeys: [positionKey(state)]`.

Not yet implemented: Accord, Twins, Wild armies; notation; UI; PBM logic.

## captureConstraints call-site (S4 wired; S7 populates)

`legality.ts` applies `targetModel.captureConstraints(state, capturerFrom, targetSq)` for **both** `StandardMove` captures and `TeleportMove` captures. Default: no registered model = no constraint. Wild's session (S7) will populate Behemoth Armor here — Veil's Wraith teleport-captures already route through this path correctly.

## lastTurnMeta (added S4)

`GameState.lastTurnMeta?: { essenceDelta?: { color, from, to } }` records the per-turn Essence change for notation (S9 `(E:n→m)` annotations). Set by `applyTurnUnchecked`; not in SFEN-X; not in positionKey. Explicitly set to `undefined` on every turn (never carries over from previous state).

## checkResponseConstraint wiring

`legality.ts` applies `oppModel.checkResponseConstraint(state, turn)` when the current mover's royals are in check **before** the move. The constraint belongs to the **checking side's** army (e.g., Phantom) and restricts the **checked side's** valid responses. Pre-computed once per `legalTurns` call (`royalsCheckedBefore`) to avoid redundant work.

## Phantom army (`src/engine/phantom.ts`)

Registered as both generator and ThreatModel for army `'Phantom'`.

**Shade** (Q-slot): slides like a Queen, cannot capture, attacks all Queen-line squares for threat purposes. Gives piercing check: once it has LOS to the enemy royal, interposition is banned — only king-move or capture-Shade responses are legal (enforced by `checkResponseConstraint`).

**Thralls** (P-slots): forward one square (no double push), diagonal captures, homing move (one square any direction to unoccupied square that reduces Chebyshev distance to enemy king). No en passant given or received. Promote to standard FIDE pieces.

`THRALL_HOMING_TWINS = 'either'` — exported constant; homing is legal vs Twins if it reduces distance to at least one Warlord.
