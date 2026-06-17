# Changelog

## S5 — 2026-06-16

**Accord army: Herald Banner, empowered threat model, queen-mode flag**

- `src/engine/accord.ts` (new): Accord `MoveGenerator` + `ThreatModel`
  - **Herald** (Q-slot): king-step move only, no captures, not royal, no attack contribution (captured normally by opponents)
  - **Banner**: `bannerZone(board, color)` (exported) — Chebyshev-≤1 zone around the friendly Herald, clipped at board edges
  - **Empowerment**: friendly Knight/Bishop/Rook in the zone gains a bonus move/attack set deduped against its native squares — one-square king-step move-or-capture by default, or full Queen sliding under the `'queen'` flag value
  - Empowerment computed fresh from the current board in both the generator and `attackedSquares` every call — checks appear/disappear purely from board position (Herald move/death, piece entering/leaving the zone), no extra state
  - `ACCORD_EMPOWERMENT: 'king-step' | 'queen'` (default `'king-step'`), exported alongside `setAccordEmpowerment(mode)` to flip it (ES module live binding)
  - Pawns never Empowered; King is a plain non-castling king-step royal (matches Phantom/Veil convention)
- `src/engine/index.ts`: `import './accord'` side-effect registration
- `tests/engine/accord.test.ts` (new, 27 tests): zone membership (center/corner/edge clipping, no-Herald, per-color), empowered rook diagonal king-step capture in/out of zone, empowered check + king exclusion from empowerment-only-covered squares, Herald-move-gives-check / Herald-move-removes-check / Herald-captured-removes-check fixtures, a checkmate that depends solely on empowerment (knight-checker geometry chosen so native attacks never overlap the king-step bonus) plus the same position with the Herald removed (not a win), edge king-step exit from the zone (legal, reverts next turn), pawns never Empowered, promoted Rook Empowered immediately, exact knight-empowered move-set enumeration, `'queen'`-mode flag flip (full diagonal slide; reverts on reset; reverts outside zone), Herald capturability/non-royal-ness, cross-army Herald capture by Crown queen, full invasion-win fixture
- All 193 tests green

## S4 — 2026-06-16

**Veil army: Essence-gated Wraith, teleport Wisps**

- `src/engine/veil.ts` (new): Veil `MoveGenerator` + `ThreatModel`
  - **Wraith** (Q-slot): Queen slides as `StandardMove` + `TeleportMove` to non-slide-reachable squares (no duplicates); captures gated at ≥1 Essence; teleport-captures have `isCapture: true`
  - **Wisps** (R-slot): `TeleportMove` to any empty square only; no captures, no attacks
  - **ThreatModel**: Wraith attacks Queen-LOS at ≥1 Essence, inert at 0; Wisps never attack; standard FIDE attacks for King/Bishop/Knight/Pawn
  - **Essence gain**: non-Wraith Veil piece captures enemy Pawn (`slot='P'`) → +1 Essence (capped 4); Wraith capture → −1 (no gain even on pawn capture)
- `src/engine/types.ts`: `GameState.lastTurnMeta?: { essenceDelta? }` for S9 notation; optional, excluded from SFEN and positionKey
- `src/engine/apply.ts`: `TeleportMove` support; Essence delta computed before board mutation and stored in `lastTurnMeta`; `lastTurnMeta` always explicitly set (never inherits prior turn's value via spread)
- `src/engine/legality.ts`: `captureConstraints` now applied to `TeleportMove` captures (S7/Wild Behemoth Armor will populate); `applyTurn` matching extended to `TeleportMove`
- `src/engine/index.ts`: `import './veil'` side-effect registration
- `tests/engine/veil.test.ts` (new, 26 tests): Essence drain 2→1→0, captures absent at 0, slide-capture vs teleport-capture deduplication, check gating by Essence, checkmate fixture at Essence ≥ 1 (not mate at 0), Wisp full move set = all empty squares, Wisp blocks sliding + Shade LOS, Wisp capturable by knight, Wraith pin at ≥1 Essence (no pin at 0), threefold draw with constant Essence, Essence change breaks repetition cycle
- All 166 tests green

## S1 — 2026-06-15

**Scaffold, engine types, SFEN-X, position keys, CI**

- Project skeleton: Vite 6 + React 18 + TypeScript strict + Vitest + ESLint 9 (flat config)
- `src/engine/types.ts`: all core types — `Square`, `Color`, `Army`, `Slot`, `Piece`, `GameState`, `Turn`, `PrimaryAction` discriminated union (`StandardMove`, `TeleportMove`, `Shatter`), `RallyStep`
- `src/engine/positions.ts`: `initialState(armyW, armyB)` for all 6 armies; Twins gets two `K`-slot Warlords on d1+e1 with no Q-slot piece; Veil Essence starts at 2
- `src/engine/sfen.ts`: `serializeSfen` / `parseSfen` / `squareToAlgebraic` / `algebraicToSquare`; 16-token SFEN-X format; `positionKeys` excluded from serialization
- `src/engine/positionKey.ts`: `positionKey` — deterministic key over board + sideToMove + castling + ep + essence + exhausted (excludes clocks and history)
- `src/engine/index.ts`: re-exports full public API
- `docs/RULES.md`: Schism Chess v2.0.1 ruleset committed verbatim
- `CLAUDE.md`: commands, layout, purity rule, turn-atomicity rationale, square encoding, exported API table
- CI: GitHub Actions — typecheck + lint + test on every push; gh-pages deploy workflow on push to main
- Tests: positions (all 6 armies × layout + castling + essence assertions), SFEN-X round-trips (21 pairings + 50 random mutations), position key sensitivity (6 dimensions), engine purity
