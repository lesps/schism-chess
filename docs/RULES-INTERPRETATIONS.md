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

### Promoted piece dispatch — `promoted?: true` flag *(superseded in v2.3)*

> **Superseded by Reinforcement Promotion (v2.3):** a promoted piece now IS its army's piece — the flag and every dispatch branch below were deleted. See the v2.3 section.

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

---

## Post-1.0 Fix Pass (v1.0.1)

### Thrall homing requires per-axis approach, not just Chebyshev reduction

**Ruling:** A homing step is legal only if it moves the Thrall genuinely toward an enemy king: the Chebyshev distance must strictly decrease **and** neither the rank distance nor the file distance may increase. Against Twins, the step must satisfy this for at least one Warlord (`THRALL_HOMING_TWINS = 'either'` unchanged).

**Code:** `stepHomesTowardKing` in `src/engine/phantom.ts`.

**Rationale:** Bare Chebyshev reduction was too loose. Whenever one axis dominated the distance, a step drifting away on the other axis still reduced the max — so a Thrall with the enemy king straight ahead could sidestep to either forward diagonal, and one with the king due east could step diagonally *backward*. Against two spread Warlords, all four diagonals could qualify simultaneously, which read as "Thralls move any direction they like." The per-axis condition restores the intended homing feel: every step visibly closes on a king.

### Shade check may be answered by any capture mechanism

**Ruling:** "Capture the Shade" as a piercing-check response includes teleport-captures (Veil Wraith), Strikes (Wild Stalker), and rampages (Wild Behemoth) — not just standard captures and Shatter.

**Code:** `checkResponseConstraint` in `src/engine/phantom.ts` now approves `teleport` (capture onto the Shade's square), `strike` (target = Shade), and `rampage` (captures include the Shade). Previously all three were vetoed unconditionally, making some Shade checks artificially unanswerable for Veil and Wild.

### Promoted Veil Queen is a plain FIDE Queen

**Ruling:** A pawn promoted into the Veil's Q-slot (possible only after the Wraith is gone) is a standard FIDE Queen: it slides and captures normally, never teleports, pays no Essence, gains none, and gives check regardless of the Essence pool.

**Code:** `veilGenerator` and `veilAttackedSquares` dispatch on `piece.promoted` for the Q-slot (mirroring the existing Phantom/Accord/Wild promoted-Q handling); `applyTurnUnchecked` guards the Wraith Essence spend with `!piece.promoted`.

**Rationale:** RULES.md §Promotion: "A promoted piece is always a standard FIDE piece with no army abilities." The Veil was the one army missing the promoted-Q dispatch, so a promoted Queen inherited the Wraith's teleport and Essence gating (including draining Essence below zero on captures).

### Essence gain limited to Bishop/Knight/Pawn capturers

**Ruling:** Only a Veil **Bishop, Knight, or Pawn** capturing an enemy pawn generates +1 Essence. A King capture or a promoted Rook capture of a pawn generates nothing. Promoted Bishops/Knights still qualify — the gain keys off the slot, since Essence is an army resource rule rather than a per-piece ability.

**Code:** the gain branch in `applyTurnUnchecked` (`src/engine/apply.ts`) requires `piece.slot ∈ {B, N, P}`.

**Rationale:** RULES.md enumerates the gain sources exactly: "+1 whenever a non-Wraith Veil piece (Bishop, Knight, or Pawn) captures an enemy pawn." The previous code granted the gain to any non-Wraith capturer, including the King.

---

## v2.2 Balance Pass *(Accord entries superseded in v2.3)*

> **Superseded:** the phalanx slide and Nightrider were replaced wholesale by Concord + the March in v2.3. The two Accord rulings below are historical.

### Phalanx Nightrider path semantics

**Ruling:** An Empowered Knight's ride continues over **empty and friendly-occupied** landing squares alike, and ends by capturing the **first enemy** on a landing square. It may never land on a friendly square. (A classical Nightrider is blocked by any occupied landing square; the phalanx version is friendly-transparent to match the Empowered slide rule — the formation parts for its own.)

**Code:** `phalanxKnightTargets` / `addPhalanxKnightAttacks` in `src/engine/accord.ts`.

### Phalanx threat includes friendly squares along the ray

**Ruling:** For threat purposes an Empowered slider (or Nightrider) **defends every friendly piece along its ray** and keeps attacking beyond them; the attack set ends at (and includes) the first enemy square. So a Banner rook behind its own pawn wall checks an enemy king on the far side of the wall, and an enemy king may not capture a piece that is phalanx-defended through another piece.

**Code:** `addPhalanxSlideAttacks` / `addPhalanxKnightAttacks` mirror the movement functions plus friendly squares.

### Shatter spares all K-slot pieces, both colors

**Ruling:** Shatter removes every adjacent piece **except K-slot pieces of either color**. Only a friendly Warlord can ever legally be adjacent (an enemy royal adjacent to a Warlord would already be in check on its own turn, which is illegal), so the both-colors formulation is a robustness choice with no reachable gameplay difference — it just guarantees Shatter can never delete a royal outright even in hand-built (`?sfen=`) positions.

**Code:** K-slot filtering in `twins.ts` `applyShatterToBoard`, `apply.ts` shatter branch, and `src/ui/shared.ts` `extractCaptures` / `ShatterPreview`.

---

## v2.3 Parsimony Pass

### Reinforcement Promotion — no `promoted` flag, no invisible state

**Ruling:** A pawn promotes to its own army's piece for the chosen slot, and the resulting piece is **indistinguishable from an original** — same movement, threat, abilities, resource interactions, notation letter, and SFEN-X encoding. The `Piece.promoted` flag and every dispatch branch keyed on it were deleted.

**Code:** `applyTurnUnchecked` creates `{ slot, color }` on promotion; `phantom.ts`/`veil.ts`/`wild.ts`/`accord.ts` have no promoted branches; `findShade`/`findHerald`/Behemoth Armor/rampage-wall checks match on slot alone.

**Consequences settled by this ruling:**
- The S8 wart "`promoted` is not serialized in SFEN-X" is resolved — there is nothing to serialize; SFEN-X round-trips are lossless again.
- A promoted Wraith shares the army Essence pool and is Essence-gated like the original.
- A promoted Herald re-establishes the Banner (Concord and the March resume).
- A promoted Behemoth has Armor; a promoted Stalker exhausts; a promoted Bronco may capture friendlies.
- Slot-cap counting (`availablePromotions`) is unchanged — all on-board pieces of a slot count, however they got there.
- Crown Royal Abundance and the Twins closed Q-slot are unchanged.

### Notation — `=Q` emission, `=^Q` legacy alias

**Ruling:** Promotion SAN is plain `=Q/=R/=B/=N` (the letter is the slot, so it reads as the army's piece). The parser accepts the pre-v2.3 `=^Q` form as an alias so old game text remains readable — but replay under v2.3 semantics may diverge for games that contained promotions (the promoted piece now has army behavior). This break is accepted and noted in the changelog.

**Code:** `turnToSan` emits `=${slot}`; all four `sanToTurn` promotion regexes use `=\^?([QRBN])`.

### Concord scoping — N/B/R only; King and Herald excluded

**Ruling:** The Concord pool is the set of slots among friendly **Knights, Bishops, and Rooks** inside the Banner. The King and the Herald neither contribute nor receive (a rook-sliding royal would warp invasion and check geometry; the keystone staying slow is the army's core tension). Pawns take no part. A lone piece's pool is its own slot — it gains nothing.

**Code:** `concordPool` in `src/engine/accord.ts`; generator and threat give each in-Banner N/B/R the union of the pool's native movesets, with normal blocking.

### March resolution — front-to-back column, deterministic

**Rulings:**
- The column steps **from the front**: marchers sorted by descending projection onto the march direction (square index as tiebreak; perpendicular marchers can never collide) each step iff their destination is currently empty. A blocked or off-board destination means the piece **holds**; nothing is ever captured.
- The **Herald must step** or there is no march in that direction; a march in which no *other* piece steps is not generated (it would duplicate the plain Herald move).
- A **pawn holds** rather than march onto the final rank (no promotion choice inside a multi-piece move).
- A March **sets no en-passant target** and never changes castling rights; it **counts as a pawn move for the fifty-move clock iff at least one pawn stepped**.
- The King marches with the Banner (this is the escort-invasion payoff); the end-state no-self-check rule applies to the whole march.

**Code:** `computeMarch` in `src/engine/accord.ts` is the single source of truth, used by the generator, `apply.ts`, and the UI's `MarchPreview`. SAN: `Q>d5` (Herald destination).

### No Executions — teleport-captures cannot target royals or Q-slot pieces

**Ruling:** The Wraith's teleport-capture generation skips enemy pieces of slot `K` or `Q`, for every army (Queen, Shade, Herald, Apex, mirror Wraith; royals were already implicitly protected since movegen never produces king-captures). Queen-line Wraith captures of those pieces remain legal.

**Interaction:** A Shade's piercing check can therefore no longer be answered by teleport-capturing the Shade — the Veil answers with a king move or a queen-line capture instead. The piercing-check rule text was updated accordingly; RULES.md §Phantom and §Veil cross-reference each other.

**Code:** slot filter in `addWraithMoves` (`src/engine/veil.ts`); threat model untouched (teleport was never part of `attackedSquares`).
