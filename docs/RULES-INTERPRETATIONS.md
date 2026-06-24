# Rules Interpretations

Judgment calls made during engine implementation, listed by sprint. Each entry names the ruling, the constant or code that encodes it, and the rationale.

---

## S3 — Phantom Army

### THRALL_HOMING_TWINS = 'either'

**Ruling:** A Thrall's homing move is legal against a Twins opponent if it reduces Chebyshev distance to **at least one** Warlord (not required to reduce distance to both).

**Code:** `THRALL_HOMING_TWINS = 'either'` in `src/engine/phantom.ts` (exported constant).

**Rationale:** The homing rule reads "reduces distance to the enemy king." Twins has two kings. Requiring reduction to both would make homing nearly useless when the Warlords are on opposite wings; requiring only one is the natural reading of "the enemy royal" under a multi-royal extension. Exported so future tests can check against the alternative (`'every'`).

---

## S7b — Wild Army: Behemoth Rampage

### RAMPAGE_VS_ARMOR = 'wall'

**Ruling:** When a Behemoth rampages along a path that would hit an enemy Behemoth outside Chebyshev 2 (i.e., a Behemoth protected by its own Armor), the rampage **stops before** that square (wall semantics). Pieces before the wall are still captured; the armored Behemoth itself is not.

**Code:** `RAMPAGE_VS_ARMOR = 'wall'` in `src/engine/wild.ts` (module constant, not exported).

**Alternative documented:** `'illegal-move'` — the rampage would be entirely illegal if the path passes through an out-of-range armored Behemoth. Rejected as too restrictive; wall semantics give Wild players useful tactical options while still respecting Armor.

**Threat model:** The wall-truncation also applies to `wildAttackedSquares`: an armored enemy Behemoth outside Chebyshev 2 blocks the rampage threat line before it, so pieces behind the wall are not considered attacked.

---

## S7b — Wild Army: Stalker Exhaustion

### Exhausted Stalker gives no check

**Ruling:** A Stalker that just executed a strike-and-return (and whose square is therefore in `state.exhausted`) contributes **zero** attacked squares for the duration of that exhaustion window. A royal standing on its diagonal range is NOT in check.

**Code:** `wildAttackedSquares` skips `exhausted` B-slot pieces in `src/engine/wild.ts`; `exhausted` set is checked per-square before adding to the attacked set.

**Rationale:** The Stalker's exhaustion models the piece being spent — it cannot threaten again until it recovers. Giving a "passive" check from an exhausted piece would contradict the flavour and create unintuitive interaction where an opponent cannot move their king to what appears to be a safe diagonal square.

---

## S8 — Full Promotion

### Blocked 7th-rank pawn has zero moves (and zero threat)

**Ruling:** A Thrall (Phantom P-slot) or any pawn-type piece that is on the 7th rank (one step from promotion) with **no open promotion slots** has **zero legal moves** — including forward push, diagonal captures, and homing moves. It also gives no diagonal threat.

**Code:** Early return in `addThrallMoves` when `promos.length === 0 && rank === seventhRank`; and in `phantomAttackedSquares` when the Thrall is on the 7th rank with no available promotions.

**Rationale:** All three move types (push, capture, homing) lead to the promotion square, which requires a promotion target. With none available, every candidate move would need to be discarded anyway. The early return is an efficiency optimization with correct semantics. The same applies to threat: a square defended only by the promotion-capturing diagonal of a blocked Thrall is not actually defended.

### Crown Royal Abundance — Q-slot always open for promotion

**Ruling:** The Crown army always has the Q-slot available as a promotion target (Royal Abundance). Multiple promoted Queens are legal for Crown. R/B/N slots remain capped at 2 (replacement-only).

**Code:** `availablePromotions` in `src/engine/movegen.ts` unconditionally adds `'Q'` to the result for Crown before checking R/B/N caps.

### Twins — Q-slot permanently closed for promotion

**Ruling:** The Twins army cannot promote to a Queen (Q-slot). The dual-Warlord structure occupies both K-slots; no Q-slot piece exists in Twins at all and none may be created via promotion.

**Code:** `availablePromotions` skips the Q-slot check entirely for Twins, returning only from R/B/N.

### Promoted piece dispatch — `promoted?: true` flag

**Ruling:** When a pawn promotes to R/B/N/Q, the resulting piece gains a `promoted: true` flag. Army generators and threat models check this flag to dispatch promoted pieces to standard FIDE behavior instead of army-specific behavior.

**Scope of the flag:**
- **Phantom:** A promoted Q-slot piece is a standard FIDE Queen (captures normally), not the Shade (which cannot capture). `findShade` skips promoted Q-slot pieces.
- **Accord:** A promoted Q-slot piece is a FIDE Queen (full sliding + captures), not the Herald (which cannot capture and defines no Banner zone). `findHerald` skips promoted Q-slot pieces. A promoted R/B/N may be Empowered by the Banner normally.
- **Veil:** A promoted R-slot piece is a standard FIDE Rook (orthogonal slides), not a Wisp (which teleports and gives no threat).
- **Wild:** Promoted Q/R/B/N pieces use standard FIDE movement and attack. In particular, a promoted R-slot piece does not have Behemoth Armor — `captureConstraints` and the rampage wall check both skip promoted R-slot pieces.

**Not serialized:** `promoted` is not part of the SFEN-X board encoding. It is set on apply and is not recovered from SFEN-X parsing — SFEN-X round-trips preserve the serialization string but not the `promoted` flag. This is acceptable for the current engine; notation/PBM replay (S9) may need to track promotion history to reconstruct the flag.

### Slot-based promotion cap counting

**Ruling:** The cap check for promotion (R ≤ 2, B ≤ 2, N ≤ 2, Q ≤ 1) counts **all** pieces of that slot currently on the board, including previously promoted pieces. If both Rook squares are already occupied — whether by original army Rooks or by pawns promoted to Rook — the slot is full and Rook is not available as a further promotion target.

**Code:** `countPiecesOfSlot` in `src/engine/movegen.ts` iterates the full board; `availablePromotions` compares against the caps.

---

## S8 — Draws and Game Status

### Threefold repetition — positionKeys counts from game start

**Ruling:** Threefold draw fires when the **current** position key appears ≥ 3 times in `state.positionKeys`. The initial position is not pre-populated in `applyTurnUnchecked`; callers who need the initial position counted must seed `positionKeys: [positionKey(initialState(...))]` before play begins.

**Code:** `gameStatus` in `src/engine/status.ts` counts occurrences of `positionKey(state)` in `state.positionKeys`.

### Insufficient-material draw — stub returns false

**Ruling:** Full insufficient-material detection (KvK, KvK+B, KvK+N, mirror-bishop endings, etc.) is deferred past S8. The stub always returns `false` (no material draw). Games with lone kings must reach fifty-move or threefold to draw.

**Code:** `checkInsufficientMaterial` in `src/engine/status.ts` returns `false` unconditionally.

### Invasion win detected before legal-move check

**Ruling:** `gameStatus` checks invasion (and draw conditions) **before** calling `legalTurns`. This means a terminal `{ type: 'win', by: 'invasion' }` or `{ type: 'draw', ... }` result may be returned even when the opponent still has legal moves. Only `{ type: 'win', by: 'checkmate' }` and `{ type: 'win', by: 'stalemate-loss' }` are determined via `legalTurns` being empty.

**Rationale:** Invasion and draws are position-level conditions that supersede the move-generation check. Checking legal moves first would be unnecessary work for the common case.

---

## S8 — Cross-Army Interaction

### Shade check vs Twins: single-check rule composes with piercing constraint

**Ruling:** When a Phantom Shade gives check to a Twins Warlord, the **piercing constraint** applies (interposition is banned). Additionally, the Twins **single-check rule** applies: if only one Warlord is in check, the primary action alone must resolve it — a Rally step cannot be used to compensate for a primary that doesn't fully resolve check. The two rules compose independently; neither overrides the other.

**Code:** `legality.ts` applies both `checkResponseConstraint` (Phantom's piercing rule) and the Twins one-action-per-check filter in the same pipeline pass. The shade-check-vs-Twins test is in `tests/engine/twins.test.ts`.

**Test:** `it('shade-check vs Twins: piercing check constraint composes with single-check rule')` — verifies that with a Shade on e8 giving check to a Warlord on e4, only king-moves and Shade-capture moves survive as legal primaries; interposition (Rook to e5) and unrelated Warlord moves (a1 Warlord) are both vetoed.
