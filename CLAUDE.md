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

**Exported API** (next session can rely on all of these from `src/engine/index.ts`):

| Export | Module |
|--------|--------|
| `initialState(armyW, armyB): GameState` | `positions.ts` |
| `serializeSfen(state): string` | `sfen.ts` |
| `parseSfen(s): GameState` | `sfen.ts` |
| `squareToAlgebraic(sq): string` | `sfen.ts` |
| `algebraicToSquare(s): Square` | `sfen.ts` |
| `positionKey(state): string` | `positionKey.ts` |
| `Square`, `Color`, `Army`, `Slot` | `types.ts` |
| `Piece`, `GameState` | `types.ts` |
| `Turn`, `PrimaryAction` | `types.ts` |
| `StandardMove`, `TeleportMove`, `Shatter`, `RallyStep` | `types.ts` |

Not yet implemented: move generation, legality checking, check detection, UI, PBM logic.
