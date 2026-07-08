# Schism Chess

A two-player asymmetric chess variant on a standard 8×8 board. Each player secretly selects one of six armies before the game begins, then plays with unique pieces and abilities — but standard chess rules apply unless an army explicitly overrides them. Win by checkmate **or** by marching your king past the midline (invasion).

**[Play online →](https://lesps.github.io/schism-chess/)**

---

## The Six Armies

| Army | Signature | Primary win lane |
|------|-----------|-----------------|
| **Crown** | Highest raw material; the only army that castles and over-promotes | Checkmate / flexible |
| **Phantom** | Shade gives *piercing* check (interposition banned); homing Thralls | Zugzwang nets, checkmate |
| **Accord** | Herald Banner — pieces share their movement in Concord and March as one | Positional control, escort invasion |
| **Twins** | Two royal Warlords; bonus Rally step; Shatter action | Dual invasion / checkmate |
| **Veil** | Essence-gated Wraith that slides or teleports; teleporting Wisps | Invasion, material pressure |
| **Wild** | Chancellor Apex, siege Behemoth, ambush Stalker, friendly-fire Bronco | Positional dominance |

## Modes

- **Local hotseat** — pass the device between moves; army choice is hidden during pick.
- **Play by mail** — share a URL after each move; army commitment is cryptographically hashed so neither player reveals until both are locked in.

---

## Local development

```bash
npm install
npm run dev          # Vite dev server → http://localhost:5173/schism-chess/
npm run typecheck    # TypeScript check
npm run lint         # ESLint
npm run test         # Vitest unit tests
npm run test:e2e     # Playwright end-to-end tests
npm run build        # Production build (runs typecheck first)
```

Requires Node 20+.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the engine design, registry pattern, SFEN-X format, PBM phase machine, and the Transport network seam.

Game rules: [docs/RULES.md](docs/RULES.md) (canonical, v2.0.1)  
Interpretation log: [docs/RULES-INTERPRETATIONS.md](docs/RULES-INTERPRETATIONS.md)  
PBM protocol: [docs/PBM-PROTOCOL.md](docs/PBM-PROTOCOL.md)
