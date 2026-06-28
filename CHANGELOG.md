# Changelog

## S12 — 2026-06-28

**Army-special interaction UX**

- `src/ui/strings.ts` (new): Single strings module — `HINTS` const object with all user-facing UI text (hint bar, button labels, preview titles, descriptions).
- `src/ui/shared.ts` (updated): Extended `DestHighlightType` union with `legal-teleport-move`, `legal-teleport-capture`, `legal-homing`, `legal-friendly-capture`, `legal-rally`; updated `buildHighlightMap` with 8-level priority system; new helpers `isThrallHomingMove`, `primaryEq`, `chebyshev`, `buildRallyHighlightMap`, `hasCrossedMidline`, `armorZone`, `squareNeighbors`.
- `src/ui/components/Board.tsx` (updated): New optional props `overlaySquares`, `rallyTurns`, `empoweredSquares`, `exhaustedSquares`, `invasionSquares`; `OverlayKind = 'banner' | 'armor' | 'blast' | 'rally-from'`; `data-rank` attribute; full `highlightClass()` dispatch for all 8 DestHighlightType values.
- `src/ui/components/PieceGlyph.tsx` (updated): `empowered` and `exhausted` boolean props; renders `✦` and `⊗` badges; `data-empowered` / `data-exhausted` attributes; 50% opacity on exhausted pieces.
- `src/ui/components/EssenceMeter.tsx` (updated): `essenceDelta` prop; animates `+N`/`−N` tick span on Veil essence changes.
- `src/ui/components/HintBar.tsx` (new): `<div role="status" aria-live="polite">` hint bar; null-renders when no message.
- `src/ui/components/ShatterPreview.tsx` (new): Modal overlay listing all adjacent doomed pieces with friendly-warning styling; `data-testid` attributes for tests.
- `src/ui/components/RampagePreview.tsx` (new): Modal overlay listing `RampageMove.captures` victims with confirm/cancel; never recomputes captures from board.
- `src/ui/screens/GameScreen.tsx` (updated): Twins two-phase input (`twinsStagingTurns` state + `primaryEq` filter + rally bar with Back / Skip); Shatter mode button; rampage-preview interception; Accord `bannerZone` overlay; Wild armor-radius overlay; empowered / exhausted / invasion sets computed via `useMemo`; hint bar wired to staging / check / exhaustion states.
- `src/ui/styles.css` (updated): New CSS variables and classes — `hl-teleport-move` (dashed dot), `hl-teleport-capture` (dashed ring), `hl-homing` (orange dot), `hl-friendly-capture` (amber ring), `hl-rally` (red dot); `overlay-{banner,armor,blast,rally-from}` via `::before`; `hl-invaded` (green tint); midline marker via `board-wrapper::after`; piece badge styles; hint-bar, shatter-bar, rally-bar, preview-overlay/sheet layouts; essence tick animation.
- `tests/ui/army-interactions.test.tsx` (new, 21 tests): Component-level tests for Twins staging filter / skip / rally highlight, ShatterPreview doomed list, RampagePreview capture list, Veil highlight type assignment, Phantom homing detection, Wild exhausted badge + no-captures, Accord empowered badge + extra destinations, Crown backward compatibility.
- `tests/e2e/army-specials.spec.ts` (new, 15 tests): Playwright e2e suite — one describe block per non-Crown army using `?sfen=` fixtures; covers Shatter+rally flow, teleport-capture highlight, piercing-check hint, empowered-Knight destinations, rampage preview chain, exhausted-Stalker badge+hint.
- `docs/checklists/S12-manual.md` (new): Manual QA checklist covering all army-specific interactions.

## S11 — 2026-06-28

**Board UI, local hotseat, Playwright e2e harness**

- `src/vite-env.d.ts` (new): Vite client types for `import.meta.env.DEV`
- `src/ui/styles.css` (new): Dark-theme CSS; CSS custom properties per army (`--army-Crown-W`, etc.); board highlight classes (`hl-selected`, `hl-last-from`, `hl-last-to`, `hl-check`, `hl-move`, `hl-capture`, `hl-special`)
- `src/ui/shared.ts` (new): `ARMY_NAMES`, `ARMY_TAGLINES`, `ARMIES`, `ARMY_ACCENTS`, `getPieceGlyph`, `getPrimaryFrom`, `getPrimaryDest`, `buildHighlightMap`, `extractCaptures`, `boardSquaresInOrder`
- `src/ui/App.tsx` (updated): Screen router (`home | new-game | game`); `?sfen=` dev-only loader gated by `import.meta.env.DEV`
- `src/ui/screens/HomeScreen.tsx` (new): Title card + "New local game" button
- `src/ui/screens/NewGameScreen.tsx` (new): 6-step blind army-pick flow: p1-privacy → p1-pick → handover → p2-privacy → p2-pick → reveal
- `src/ui/screens/GameScreen.tsx` (new): Main game UI — board, side-to-move indicator, captured-pieces tray, scrollable SAN move list, Essence meters (Veil), auto-flip with lock toggle, chooser sheet, end modal
- `src/ui/components/Board.tsx` (new): 8×8 grid; `data-sq={sq}` on every cell; highlight classes from `buildHighlightMap`; rank/file coordinate labels
- `src/ui/components/TurnChooser.tsx` (new): Bottom-sheet disambiguation for promotions, Shatter, rally variants
- `src/ui/components/GameEndModal.tsx` (new): Win/draw modal covering all 5 `GameStatus` outcomes
- `src/ui/hooks/useGameLogic.ts` (new): Core React hook — `legalTurns`, `applyTurn`, captured-piece history, checked-square detection via `getThreatModel`
- `src/app/main.tsx` (updated): Imports `styles.css`
- `vitest.config.ts` (updated): `environmentMatchGlobs` to use jsdom for `tests/ui/**`; `setupFiles` for jest-dom
- `tests/ui/setup.ts` (new): jest-dom matcher registration for Vitest
- `tests/ui/types.d.ts` (new): Module augmentation — `Assertion` extends `TestingLibraryMatchers`
- `tests/ui/Board.test.tsx` (new, 13 tests): 64 squares, light/dark alternation, piece placement, highlight classes, click callbacks, flip, coordinate labels
- `tests/ui/TurnChooser.test.tsx` (new, 4 tests): Option count, selection, cancel, promotion via SFEN position
- `tests/e2e/hotseat.spec.ts` (new, 4 tests): Scholar's Mate to checkmate modal, SAN move list, army picker, back navigation
- `tests/e2e/invasion.spec.ts` (new, 2 tests): `?sfen=` near-invasion position → d4-d5 → win modal → new game returns home
- `playwright.config.ts` (new): Dev-server e2e config; pre-installed Chromium in dev env; CI uses standard playwright install
- `.github/workflows/ci.yml` (updated): Added `e2e` job — `playwright install chromium` + `npm run build` + `npx playwright test`
- `package.json` (updated): `test:e2e` script; devDependencies: `@playwright/test`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`
- 419 tests green (402 pre-existing + 17 new UI component tests); 6 Playwright e2e tests green

## S10 — 2026-06-26

**PBM payloads, commit-reveal, replay validation, protocol doc**

- `src/pbm/types.ts` (new): `Hasher`, `PBMPayload`, `Phase`, `PayloadResult`, `ValidationResult`, `ValidationError` — full type surface for the PBM layer
- `src/pbm/codec.ts` (new): `checkSchema` (hand-rolled validator), `encodePayload` (lz-string URI-component compression), `decodePayload` (decompress + schema check)
- `src/pbm/validate.ts` (new): `validatePayload(raw, hasher)` — four-stage pipeline: schema + version check → SHA-256 hash verification → full move replay via S9 `replayGame` → result consistency check; typed error union for each failure mode
- `src/pbm/game.ts` (new): `createGame`, `respondToCommit`, `revealArmy`, `appendTurn` — pure payload-in/payload-out game flow; `appendTurn` replays existing moves to get current state then converts Turn to SAN via `turnToSan`
- `src/pbm/index.ts`: exports full PBM public API
- `docs/PBM-PROTOCOL.md` (new): byte-level wire format, phase machine, commitment hash spec, moves array encoding, validation rules, threat model (detectable vs. undetectable tampering, monotonic history check note), Network addon section (server as payload mailbox above a `Transport` interface)
- `tests/pbm/pbm.test.ts` (new, 22 tests):
  - Full handshake: create → respond → reveal → 4 moves of Fool's Mate → finished; `validatePayload` clean at every intermediate stage
  - Hash mismatch: wrong salt, wrong army at reveal, tampered `reveal.salt`, tampered `reveal.army`
  - Tampered move list: blocked-queen SAN fails replay at correct `{ moveNumber, side }`, invalid SAN gives replay error
  - Forged result: result on ongoing game, null result on finished game, wrong winner
  - Unknown version: v2 gives `newer-client`, missing `v` gives `schema`
  - Round-trip encode/decode identity at commit phase and mid-game; 60-ply game stays under 6 KB encoded (~540 chars actual)
  - Commit binding: mutating `armies.B` to an army whose Q-slot piece cannot make a recorded queen move fails replay
  - Black-creator flow: `commit.by = 'B'` path validates correctly
  - Schema: null/array/minimal-object inputs rejected
- 402 tests green (380 pre-existing + 22 new)

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
