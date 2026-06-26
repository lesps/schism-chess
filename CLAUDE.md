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
src/pbm/       # Pure TS — play-by-post logic (S10: types, codec, game flow, validation)
src/ui/        # React components
src/app/       # App wiring (main.tsx entry point)
tests/         # Mirrors src/ structure
docs/          # RULES.md (canonical ruleset, v2.0.1); RULES-INTERPRETATIONS.md (judgment calls)
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
Done: S5 (Accord army: Herald + Banner aura, empowerment-aware threat model, `ACCORD_EMPOWERMENT` flag)  
Done: S6 (Twins army: dual Warlords, atomic move+Rally, Shatter, one-action-per-check, dual-invasion win)  
Done: S7a (Wild army: Apex/Bronco full, Behemoth Armor hook live, interim Behemoth/Stalker — captureConstraints call site existed from S2/S4)  
Done: S7b (Wild army complete: Behemoth rampage wall-aware, Stalker strike-and-return + exhaustion + state-aware threat)  
Done: S8 (Full promotion for all 6 armies, `promoted` flag, promoted-piece dispatch, blocked-pawn semantics, shade-check-vs-Twins todo resolved, 21-matchup × 50-game property suite, `docs/RULES-INTERPRETATIONS.md`) — **engine feature-complete**  
Done: S9 (Notation: `turnToSan`, `sanToTurn`, `serializeGame`, `parseGame`, `replayGame`; full round-trip property suite 21 matchups; game fixtures; Thrall homing `P`-prefix notation; Veil `(E:n→m)` essence annotation; Wild `~` exhaustion; Twins rally `;K...` and Shatter `K@sq`)  
Done: S10 (PBM core: commit-reveal handshake, lz-string URL payloads, full replay validation, tampering tests, `docs/PBM-PROTOCOL.md`)

**No remaining engine todos.**

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
| `StandardMove`, `TeleportMove`, `Shatter`, `RampageMove`, `StrikeMove`, `RallyStep` | `types.ts` |
| `ParseError`, `ReplayError`, `GameRecord` | `notation.ts` |
| `isParseError(x): x is ParseError` | `notation.ts` |
| `turnToSan(state, turn): string` | `notation.ts` |
| `sanToTurn(state, san): Turn \| ParseError` | `notation.ts` |
| `serializeGame(record): string` | `notation.ts` |
| `parseGame(text): GameRecord \| ParseError` | `notation.ts` |
| `replayGame(record): { finalState } \| ReplayError` | `notation.ts` |

## PBM API (`src/pbm/index.ts`)

| Export | Notes |
|--------|-------|
| `createGame(label, color, army, salt, hasher)` | Commit-phase payload; hash = SHA-256(army:salt) |
| `respondToCommit(payload, label, army)` | Reveal-phase payload; respondent picks army |
| `revealArmy(payload, army, salt, hasher)` | Play-phase payload; verifies hash |
| `appendTurn(payload, turn)` | Appends SAN; sets result + 'finished' when terminal |
| `validatePayload(raw, hasher)` | Full pipeline: schema → hash → replay → result |
| `encodePayload(payload)` | lz-string → URL-safe string |
| `decodePayload(s)` | Decompress + schema-check → PBMPayload \| { error } |
| `checkSchema(raw)` | Schema-only check → PBMPayload \| { error } |
| `Hasher` (interface) | `{ sha256(s): Promise<string> }` — inject browser/node impl |
| `PBMPayload` (type) | Versioned JSON payload |
| `Phase`, `PayloadResult` | Phase union; result string type |
| `ValidationResult`, `ValidationError` | Typed success/failure union |

Protocol doc: `docs/PBM-PROTOCOL.md`

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

Invasion: White wins when a K-slot royal reaches **row index ≥ 4** (rank 5+); Black wins on **row index ≤ 3** (rank 4−). Beyond-midline semantics: any row past the threshold counts, not just the exact row. Only K-slot pieces trigger invasion (Q/R/B/N/P past the midline do not).  
Twins special case: BOTH Warlords must be past the midline simultaneously, and neither may be in check at that moment.  
Stalemate = loss for the stalemated side.  
Insufficient-material draw stub returns false (full detection deferred past S8; stub is intentional).

## positionKeys convention

`applyTurnUnchecked` appends the resulting position's key to `positionKeys`.  
Threefold draw triggers when the current key appears ≥ 3 times in `positionKeys`.  
Initial position is not pre-populated; if you need it counted start the game with `positionKeys: [positionKey(state)]`.

Not yet implemented: notation; UI; PBM logic.

## captureConstraints call-site (S4 wired; S7a populates; S7b extended)

`legality.ts` applies `targetModel.captureConstraints(state, capturerFrom, targetSq)` for `StandardMove` captures, `TeleportMove` captures, each square in `RampageMove.captures`, and `StrikeMove.target`. Default: no registered model = no constraint. Wild's `captureConstraints` (S7a) enforces Behemoth Armor: enemy captures of the Behemoth (R-slot) require `Chebyshev(capturerFrom, targetSq) ≤ 2`; friendly captures bypass Armor. Shatter (`type: 'shatter'`) is NOT routed through `captureConstraints` — it removes neighbors directly in `apply.ts`, so it always clears a Behemoth regardless of distance.

## lastTurnMeta (added S4)

`GameState.lastTurnMeta?: { essenceDelta?: { color, from, to } }` records the per-turn Essence change for notation (S9 `(E:n→m)` annotations). Set by `applyTurnUnchecked`; not in SFEN-X; not in positionKey. Explicitly set to `undefined` on every turn (never carries over from previous state).

## checkResponseConstraint wiring

`legality.ts` applies `oppModel.checkResponseConstraint(state, turn)` when the current mover's royals are in check **before** the move. The constraint belongs to the **checking side's** army (e.g., Phantom) and restricts the **checked side's** valid responses. Pre-computed once per `legalTurns` call (`royalsCheckedBefore`) to avoid redundant work.

## Phantom army (`src/engine/phantom.ts`)

Registered as both generator and ThreatModel for army `'Phantom'`.

**Shade** (Q-slot): slides like a Queen, cannot capture, attacks all Queen-line squares for threat purposes. Gives piercing check: once it has LOS to the enemy royal, interposition is banned — only king-move or capture-Shade responses are legal (enforced by `checkResponseConstraint`).

**Thralls** (P-slots): forward one square (no double push), diagonal captures, homing move (one square any direction to unoccupied square that reduces Chebyshev distance to enemy king). No en passant given or received. Promote to standard FIDE pieces.

`THRALL_HOMING_TWINS = 'either'` — exported constant; homing is legal vs Twins if it reduces distance to at least one Warlord.

## Accord army (`src/engine/accord.ts`)

Registered as both generator and ThreatModel for army `'Accord'`.

**Herald** (Q-slot): king-step move only, **cannot capture** (target square must be empty). Not royal — never appears in `royalsInCheck`, contributes zero attacked squares (same convention as Veil's Wisp), and is captured like any ordinary piece by the opponent's own movegen.

**Banner**: `bannerZone(board, color)` (exported) returns the Chebyshev-distance-≤1 zone around the friendly Herald, clipped at the board edge (4 squares in a corner, 6 on an edge, 9 in the open). A friendly Knight/Bishop/Rook standing in that zone is **Empowered** — computed fresh from the current board on every call to the generator and to `attackedSquares`, so checks appear/vanish purely positionally (Herald moves, dies, or the piece leaves the zone) with no extra bookkeeping. Empowerment bonus targets are deduped against the piece's native move/attack set before being added (`accord.ts`'s `slideTargets`/`knightTargets`/`kingStepTargets` helpers), so there are no duplicate `Turn`s.

**`ACCORD_EMPOWERMENT: 'king-step' | 'queen'`** (default `'king-step'`) — module-level flag in `accord.ts`, mutated only via the exported `setAccordEmpowerment(mode)` (ES module live-binding; importers read `ACCORD_EMPOWERMENT` directly but must call the setter to change it, e.g. in test `afterEach`). `'king-step'`: Empowered pieces gain a one-square move-or-capture in any direction. `'queen'`: the bonus becomes full Queen sliding from the piece's square instead. Pawns are never Empowered; promoted R/B/N are Empowered normally (promotion carries no metadata, so this falls out of reading the board as-is).

Pawns/King have no Accord-specific behavior (King is a plain non-castling king-step royal, matching the Phantom/Veil convention — only Crown gets castling rights from `initialState`).

## Twins army (`src/engine/twins.ts`)

Registered as both generator and ThreatModel for army `'Twins'`.

**Warlords** (both K-slots, d1/e1 for White, d8/e8 for Black): king-step move or capture in any of the 8 adjacent squares. Both Warlords are royal — `royalsInCheck` returns the squares of all checked K-slot pieces.

**Rally** (optional bonus step): after the primary action, exactly one Warlord may move one square to an unoccupied square. Non-capturing. May not move into check. Encoded as `Turn.rally: RallyStep | undefined`.

**Shatter** (primary action type `'shatter'`): the Warlord stays in place and atomically removes all pieces on its 8 surrounding squares (friendly and enemy alike). Bypasses `captureConstraints`. Illegal if the other Warlord is adjacent (Chebyshev distance 1). Resets the halfmove clock if ≥ 1 piece is removed.

**One-action-per-check rule**: If exactly one Warlord is in check before the turn, the primary alone must fully resolve it (after primary, 0 Warlords in check). If both Warlords are in check (double check), the primary+rally together must resolve both — enforced by the kernel's universal end-state filter, with no additional intermediate constraint.

**Dual invasion**: Both Warlords must be simultaneously past the midline (row ≥ 4 for White, row ≤ 3 for Black) and neither in check. Checked by `gameStatus` for the previous mover.

**Kernel changes made for S6** (all backward-compatible):
- `apply.ts`: Shatter action handling; rally application after all primary types.
- `legality.ts`: `rallyEq()` helper; Shatter matching in `applyTurn`'s legality check.
- `status.ts`: Beyond-midline invasion semantics (`row >= 4` for White, `row <= 3` for Black, K-slot only); Twins dual-invasion branch.

## Wild army (`src/engine/wild.ts`) — complete as of S7b

Registered as both generator and ThreatModel for army `'Wild'`.

**Apex** (Q-slot): chancellor — Rook slides OR Knight jumps. Captures normally (enemy only).

**Behemoth** (R-slot): up to 3 squares orthogonally; may capture friendly pieces (not own royal).  
**Rampage** (`RampageMove`): on any capture, must continue to max distance (3 from origin or board edge), clearing every piece in the path (friendly and enemy). Stops before an out-of-range enemy armored Behemoth (`RAMPAGE_VS_ARMOR = 'wall'`; pieces before the wall are still captured). Illegal if the path crosses a friendly royal. Threat model uses the same wall-truncation: an armored Behemoth outside Chebyshev 2 blocks the threat line before it, so it can body-block a rampage check.  
**`RAMPAGE_VS_ARMOR = 'wall'`** (module constant in `wild.ts`): resolved ruling. Alternative `'illegal-move'` documented in comment.

**Stalker** (B-slot): up to 2 squares diagonally.  
**Strike-and-Return** (`StrikeMove`): on capture, target is removed and Stalker stays at home square (`from`). `type: 'strike'` in `PrimaryAction`.  
**Exhaustion**: after a strike, the Stalker's home square is added to `state.exhausted`. On the controller's next turn, the exhausted Stalker may not capture (non-capture diagonal moves still allowed). Exhaustion is cleared from `state.exhausted` at the end of the controller's next turn. **Exhausted Stalker contributes NO attacked squares** (state-aware threat, same pattern as 0-Essence Wraith) — a royal in its diagonal range is NOT in check during the exhaustion window.  
**S8 note**: exhausted-Stalker-gives-no-check interpretation is confirmed. Record in RULES-INTERPRETATIONS.md at S8.

**Bronco** (N-slot): standard Knight; may capture friendly pieces, never own royal.

**Armor** (captureConstraints, already S7a): enemy pieces may capture a Behemoth only from within Chebyshev 2 of its square. Friendly captures bypass Armor. Applied to `StandardMove`, `TeleportMove`, `RampageMove` (each captured square), and `StrikeMove` (target square) in `legality.ts`.
