# Schism Chess — Architecture

This document describes the structure of the codebase as it exists. It is the map a new contributor needs to navigate without reading every file.

---

## Directory layout

```
src/
  engine/      Pure TypeScript — zero React/DOM/Vite imports. The game rules.
  pbm/         Pure TypeScript — play-by-mail protocol (commit-reveal, validation).
  ui/          React components and screens.
  app/         Entry point (main.tsx) and app-level singletons (transport, hasher).
tests/         Mirrors src/ structure; vitest for unit, playwright for e2e.
docs/          RULES.md (canonical ruleset), PBM-PROTOCOL.md, RULES-INTERPRETATIONS.md.
```

The **Engine Purity Rule** is enforced two ways: ESLint `no-restricted-imports` (see `eslint.config.js`) and a filesystem grep in `tests/engine/purity.test.ts`. Neither `src/engine/` nor `src/pbm/` may import from React, Vite, or any browser global.

---

## Engine (`src/engine/`)

### Square encoding

`type Square = number` (0–63).  
`index = rank * 8 + file`. Rank 0 = White's 1st rank. File 0 = a-file.  
`a1 = 0`, `h1 = 7`, `h8 = 63`.

Helpers: `squareToAlgebraic`, `algebraicToSquare` (exported from `sfen.ts`).

### Core pipeline

```
legalTurns(state) →
  pseudo-legal generation (army generator)
  → filter: no self-check after move
  → filter: castling through/from-check
  → captureConstraints veto (target army)
  → checkResponseConstraint (opponent army, when mover is in check)
```

The pipeline lives in `legality.ts`. It calls into army-specific registries — it never hard-codes per-army logic.

### Registry pattern

**Every army is registered, never hard-coded.** Two registries:

```ts
registerGenerator(army, fn)    // in movegen.ts
registerThreatModel(army, model) // in threat.ts
```

A `MoveGenerator` produces pseudo-legal `Turn[]` for a given color.  
A `ThreatModel` answers three questions:
- `attackedSquares(state, color)` — which squares does `color` threaten?
- `royalsInCheck(state, color)` — which of `color`'s royals are in check?
- `captureConstraints?(state, capturerFrom, targetSq)` — may this capture happen?
- `checkResponseConstraint?(state, turn)` — when in check, may the checked side make this move?

To add a new army: implement a generator and threat model, call `registerGenerator`/`registerThreatModel`, and import the module in `index.ts` for the side-effect registration. No pipeline edits required.

### Turn atomicity (Twins)

```ts
type Turn = { primary: PrimaryAction; rally?: RallyStep }
```

The Twins' normal-move + optional Rally is **one atomic unit**. All legality is evaluated per-`Turn`, not per sub-move. This is why `RallyStep` lives on `Turn` rather than being a separate action — it makes the one-action-per-check rule in §4 of RULES.md trivially enforceable without special-casing.

### Named constants (with locations)

| Constant | File | Meaning |
|----------|------|---------|
| `THRALL_HOMING_TWINS` | `src/engine/phantom.ts` | `'either'` — homing is legal vs Twins if it reduces distance to at least one Warlord |
| `RAMPAGE_VS_ARMOR` | `src/engine/wild.ts` | `'wall'` — an armored out-of-range Behemoth blocks the rampage line rather than making the move illegal |
| `ACCORD_EMPOWERMENT` | `src/engine/accord.ts` | `'king-step'` (default) or `'queen'` — empowerment bonus mode; mutated only via `setAccordEmpowerment()` |

### SFEN-X format

16 `/`-separated tokens:

```
<r8>/<r7>/…/<r1>/<side>/<armyW,armyB>/<castling>/<ep>/<essW,essB>/<exhausted>/<halfmove>/<fullmove>
```

Board letters are slot letters (K Q R B N P), uppercase=White, lowercase=Black.  
`positionKeys` is **not** serialized — it is derivable from a game record and stored in `GameState` only for threefold-repetition detection.

### captureConstraints call-site

`legality.ts` calls `targetModel.captureConstraints(state, capturerFrom, targetSq)` for every capture type: `StandardMove`, `TeleportMove`, each square in `RampageMove.captures`, and `StrikeMove.target`. Shatter bypasses it (handled directly in `apply.ts`). Wild's implementation enforces Behemoth Armor (Chebyshev ≤ 2 from Behemoth required for enemy captures).

---

## PBM layer (`src/pbm/`)

The play-by-mail protocol uses a commit-reveal handshake: the committing player hashes their army choice (`SHA-256(army:salt)`) before sharing. Full spec: [docs/PBM-PROTOCOL.md](PBM-PROTOCOL.md).

### Phase machine

```
commit  →  reveal  →  play  →  finished
```

Each phase is a `PBMPayload` JSON object, compressed with lz-string, encoded as a URL fragment (`#g=<payload>`).

### Validation pipeline (`validatePayload`)

Four stages: schema check → hash verification → full move replay via `replayGame` → result consistency. Any stage can return a typed `ValidationError`.

### Monotonic history guard

`checkMonotonicGuard(stored, incoming)` — returns `false` if the incoming payload's move list is shorter than or diverges from the stored one. The app shows `ConflictScreen` on failure.

---

## UI (`src/ui/`)

The UI is a dumb terminal: it renders `GameState` and submits `Turn`s; it never re-implements a rule.

### Screen router

`App.tsx` is a single-component router driven by a `Screen` discriminated union. Navigation is imperative (`setScreen(…)`), not URL-based (except for `#g=` PBM links and `#rules` deep-links). Screens:

| Screen type | Component |
|-------------|-----------|
| `home` | `HomeScreen` |
| `new-game` | `NewGameScreen` |
| `game` | `GameScreen` |
| `pbm-game` | `GameScreen` with `myColor` prop |
| `games-list` | `GamesListScreen` |
| `pbm-create` | `PBMCreateScreen` |
| `pbm-respond` | `PBMRespondScreen` |
| `import` | `ImportScreen` |
| `replay` | `ReplayScreen` |
| `rules` | `RulesScreen` |
| `share`, `conflict`, `salt-missing`, `import-error` | Utility screens |

### `GameScreen` data flow

```
useGameLogic (hook)
  ├─ legalTurns(state)
  ├─ applyTurn(state, turn) → new state
  ├─ captured-piece history
  └─ checkedSquares via getThreatModel

GameScreen (component)
  ├─ Board (render + click)
  ├─ SanInput (keyboard play via sanToTurn)
  ├─ CapturedPieceTray
  ├─ EssenceMeter (Veil only)
  ├─ MoveListPanel (aria-live log)
  └─ GameEndModal
```

### Chooser pattern

When `(from, dest)` maps to multiple legal `Turn`s (promotions, Twins rally variants), `GameScreen` sets `chooserTurns` state. `TurnChooser` renders a bottom sheet; selecting calls `submitTurn(turn)` and clears it.

---

## Transport seam (`src/app/transport.ts`)

```ts
interface Transport {
  loadGame(id: string): PBMPayload | null;
  saveGame(id: string, payload: PBMPayload): void;
  listGames(): Array<{ id: string; payload: PBMPayload }>;
  deleteGame(id: string): void;
  loadMeta(id: string): LocalGameMeta | null;
  saveMeta(id: string, meta: LocalGameMeta): void;
}
```

Currently implemented as `LocalStorageTransport`. A future cloud backend replaces this singleton — all persistence goes through the `Transport` interface, so no other code changes are needed. See [PBM-PROTOCOL.md §Network](PBM-PROTOCOL.md) for the planned server-as-mailbox design.

localStorage keys: `schism-game-{id}` (payload), `schism-meta-{id}` (metadata).

---

## Build and CI

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint src tests
npm run test        # vitest run (unit + component)
npm run test:e2e    # playwright test (e2e in Chromium)
npm run build       # tsc --noEmit + vite build
```

GitHub Actions (`.github/workflows/`):
- `ci.yml` — runs on every push/PR: typecheck, lint, unit tests, build, e2e.
- `deploy.yml` — runs on push to `main` or semver tags (`v*`): builds and deploys to GitHub Pages via `peaceiris/actions-gh-pages`.

The Vite base is `/schism-chess/` to match the GitHub Pages URL.
