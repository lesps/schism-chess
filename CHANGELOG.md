# Changelog

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
