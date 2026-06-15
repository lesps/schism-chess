# Schism Chess — Rules v2.0.1

A chess variant inspired by David Sirlin's Chess 2: The Sequel. Six asymmetric armies, a midline invasion win condition, and no hidden information.

> **v2.0 is an edition change, not a patch.** It rebuilds the armies around four principles: (1) a shared power budget, (2) universal counterplay — nothing is permanently uncapturable, (3) diversified win-condition lanes, and (4) reduced hidden bookkeeping. See [Design Notes](#design-notes) for the rationale and the budget table.

-----

## Table of Contents

1. [Overview](#overview)
1. [Win Conditions](#win-conditions)
1. [Army Selection](#army-selection)
1. [Universal Rules](#universal-rules)
1. [The Six Armies](#the-six-armies)
- [The Crown](#1-the-crown)
- [The Phantom](#2-the-phantom)
- [The Accord](#3-the-accord)
- [The Twins](#4-the-twins)
- [The Veil](#5-the-veil)
- [The Wild](#6-the-wild)
1. [Promotion](#promotion)
1. [Draws](#draws)
1. [Notation](#notation)
1. [Design Notes](#design-notes)
1. [Changelog](#changelog)

-----

## Overview

Schism Chess is a two-player, perfect-information strategy game on a standard 8×8 board. Each player selects one of six asymmetric armies before play. Mirror matches are allowed (21 matchups). There is no hidden state, no randomness, and no resource bidding.

-----

## Win Conditions

**Checkmate.** Win by checkmating the opponent's king (or either Warlord, for The Twins).

**Midline Invasion.** Win immediately when your king legally occupies the 5th rank from your own perspective (rank 5 for White, rank 4 for Black) without being in check. For The Twins, **both** Warlords must cross. The midline is the boundary between ranks 4 and 5.

**Stalemate = Loss.** If you have no legal move on your turn, you lose. This is not a draw.

-----

## Army Selection

Players choose armies simultaneously before the first move (simultaneous reveal locally; sealed/hashed commitment in play-by-post). Army choice is public once revealed.

-----

## Universal Rules

These apply to all armies unless a specific army rule explicitly overrides them.

**Board and Setup.** Standard 8×8 board, standard layout (pawns on the 2nd rank, pieces on the 1st), with per-army substitutions.

**Turn Structure.** White moves first; players alternate. On your turn you make exactly one legal move (exception: The Twins may take a bonus Rally).

**Check.** You must resolve check on your turn. You may not make a move that leaves your own royal piece in check, nor move a royal piece into check.

**Captures.** Moving onto an enemy-occupied square removes that piece. Captures are uncontested — no bidding or duelling. (The Veil's Wraith pays Essence; see that army.)

**The Counterplay Principle (new in v2.0).** *No piece in Schism Chess is permanently uncapturable.* Every piece can be removed by ordinary capture. Pieces with unusual survivability are limited by **cost or condition** (e.g., the Behemoth's position-based Armor, the Wraith's Essence), never by absolute immunity. This guarantees every army always has an answer to every enemy piece.

**Pawns — Standard Behavior.** Unless an army says otherwise: forward one (two on first move), capture one diagonally forward, en passant on the immediately following turn only.

**No Castling** unless an army permits it. Only The Crown castles.

-----

## The Six Armies

Quick identities and primary win lanes:

|Army   |Signature                                                   |Primary win lane                   |
|-------|------------------------------------------------------------|-----------------------------------|
|Crown  |Highest raw material; only army that castles & over-promotes|Checkmate / flexible               |
|Phantom|Shade gives **piercing** check; homing Thralls              |Zugzwang nets, checkmate           |
|Accord |Herald **Banner** empowers a clustered phalanx              |Positional control, escort invasion|
|Twins  |Two royal Warlords; Rally action economy; Shatter           |Invasion + tactical tempo          |
|Veil   |Essence-gated teleporting Wraith that can now **check**     |Surgical checkmate + invasion      |
|Wild   |Unorthodox attackers (chancellor, siege, ambush)            |Aggressive checkmate               |

-----

### 1. The Crown

*The standard army. Highest floor, highest raw material, most flexible. No bad matchups, no dominant ones.*

**Composition (standard):** King e1/e8, Queen d1/d8, Rooks a1,h1, Bishops c1,f1, Knights b1,g1, Pawns a2–h2.

**Piece Rules:** All pieces move exactly as in FIDE chess.

**Special Rules:**

- **Castling.** Standard FIDE castling (the only army with it).
- **Royal Abundance.** The Crown is exempt from the Queen half of the replacement-only promotion rule: it may promote a pawn to a **Queen even if it already has a Queen on the board.** (All other slots still follow replacement-only; see [Promotion](#promotion).)

**Identity:** The benchmark army. It owns the single strongest piece in the game (a true Queen), the safest king (castling), and a late-game pawn-to-Queen upside no one else has. It wins by conventional pressure and is never structurally lost — but it has no explosive gimmick, so it must out-play rather than out-trick.

-----

### 2. The Phantom

*A relentless hunter. The Shade cannot be blocked — only outrun or struck down.*

**Composition:** King e1/e8, **Shade** d1/d8 (Queen slot), Rooks a1,h1, Bishops c1,f1, Knights b1,g1, **Thralls** a2–h2 (Pawn slots).

**Piece Rules:**

**Shade**

- Moves as a Queen (orthogonal/diagonal, any distance, blocked by pieces like a Queen).
- **Cannot capture.**
- **Can be captured normally** by any enemy piece (Counterplay Principle).
- **Piercing check.** The Shade gives check like a Queen **and requires a clear line of sight** — intervening pieces block it, so the Shade gives **no check through a wall** (in particular, no check exists at game start, when files and diagonals are blocked by pawns). Once the Shade *does* check, that check **may not be answered by interposing a piece**: the only legal responses are to **move the king** or to **capture the Shade.** The Shade can give checkmate.

> **v2.0.1 fix.** v2.0 described this as an "unblockable check." Simulation showed that reading was incoherent and game-breaking: interpreted as checking *through* blockers, the Shade put an opponent's royal in checkmate on move 0 along its starting file (it forced an immediate loss in Phantom-vs-Twins). The piercing-check definition above — line-of-sight to *give* the check, no interposition to *answer* it — is the coherent, balanced version and is what v2.0.1 ships.

**Thralls**

- Move one square forward (no two-square first move); capture one square diagonally forward.
- **Homing Move:** instead of moving forward, a Thrall may move one square in *any* direction to an unoccupied square, provided it reduces the Chebyshev distance to the enemy king.
- No en passant (given or received). Count as pawns for promotion and all other purposes.

**Identity:** The Shade is a zoning and mating engine, not a fighter — it removes the "interpose" escape from check, so it drives the enemy king and sets up the homing-Thrall net for zugzwang or invasion-blocking. Its weakness is real: the Shade adds **zero** capturing material, and now that it can be captured, a determined opponent can spend a piece to end the harassment. The Phantom is the lightest army on raw material and must convert pressure into a mate or a stalemate-loss.

-----

### 3. The Accord

*An army that fights as a coordinated phalanx around its standard-bearer. v2.0 replaces piece-to-piece linking with a single, glanceable Banner aura.*

**Composition:** King e1/e8, **Herald** d1/d8 (Queen slot), Rooks a1,h1, Bishops c1,f1, Knights b1,g1, Pawns a2–h2.

**Piece Rules:**

**Herald**

- Moves one square in any direction (like a king). **Cannot capture.**
- **Not royal** — never in check, cannot be checkmated — but **can be captured normally.** It is the keystone of the army, not a king.

**The Banner (aura)**

- The Herald projects a **Banner** over its own square and the 8 squares orthogonally/diagonally adjacent to it (a 3×3 zone).
- A friendly **Knight, Bishop, or Rook standing inside the Banner is Empowered.**
- **Empowered** pieces gain a **king-step** — in addition to their native movement, they may move *or capture* one square in any direction. (An Empowered Knight is a knight + king-step; an Empowered Bishop or Rook gains one-square moves in its off-directions, etc.)
- Empowerment applies to **everything the piece does this turn**: movement, captures, giving check, and defending. Because membership in the Banner is a single glance ("is it in the Herald's 3×3?"), there is no adjacency graph to track and no hidden discovered-check bookkeeping.
- Empowerment is evaluated continuously from the **current board position**. A piece that leaves the Banner (or whose Herald is captured or moves away) reverts to its native movement immediately.
- Pawns are never Empowered. A promoted Rook/Bishop/Knight is Empowered normally while in the Banner.

> **Tuning knob (playtest):** if the Accord underperforms, upgrade Empowerment from "+king-step" to "moves as a Queen while in the Banner." The king-step version is the conservative starting point.

**Identity:** The Accord is the highest-skill army and the clearest expression of the Counterplay Principle: its power is enormous when 3–5 pieces are packed around the mobile Herald, but it is a slow phalanx — to attack across the board a piece must leave the Banner and revert, and the **Herald itself is capturable.** The entire structure collapses the moment the keystone falls, so the opponent always has a target. The Accord wants to avoid trades and advance its formation intact (a natural midline-escort army).

-----

### 4. The Twins

*Two warrior-kings. Twice the royal targets, twice the invasion difficulty, unmatched action economy.*

**Composition:** **Warlords** d1,e1 (King + Queen slots), Rooks a1,h1, Bishops c1,f1, Knights b1,g1, Pawns a2–h2.

**Piece Rules:**

**Warlords**

- Each moves and captures as a standard king (one square any direction).
- **Both are royal.** If either is checkmated, The Twins player loses.
- Both must cross the midline to win by invasion.
- **Answering checks — one action per check (revised in v2.0):** the player must end the turn with **neither** Warlord in check.
  - If **exactly one** Warlord is in check, it must be resolved by the **normal move alone** (as in standard chess). Rally may not be used to escape a single check.
  - If **both** Warlords are in check simultaneously (e.g., a knight or discovered fork), the player **may use the normal move *and* the Rally together** to bring both to safety — one action per check. Rally remains non-capturing, so if a check can only be answered by a capture, that capture must be the normal move.
  - If the player cannot end the turn with both Warlords safe under these constraints, it is checkmate.

**Shatter**

- Instead of a normal move, a Warlord may Shatter: it stays in place and removes **all** pieces (friendly and enemy) on the 8 surrounding squares, **regardless of any protective ability they have.**
- Illegal if the other Warlord is adjacent, or if the resulting position would leave either Warlord in check.
- Counts as the normal move (a Rally may still follow).

**Rally**

- After the normal move, optionally move exactly one Warlord one step. **Non-capturing, movement only.** A Warlord may not Rally into check. (See the one-action-per-check rule above for when Rally may complete check resolution.)

**Identity:** Best action economy in the game (≈1.5 moves/turn) and natural invaders, balanced against carrying two royal targets. The v2.0 check rule removes the old instant-loss fork (a single piece checking both Warlords with no capture available) while leaving ordinary single-check mates fully intact — verified against test positions. Shatter is the panic valve and a superb answer to clustered enemies such as the Accord's phalanx.

-----

### 5. The Veil

*Ghosts and shadows. v2.0 turns the Wraith from a defensive wall-builder into a resource-gated surgical assassin that can actually deliver mate.*

**Composition:** King e1/e8, **Wraith** d1/d8 (Queen slot), **Wisps** a1,h1 (Rook slots), Bishops c1,f1, Knights b1,g1, Pawns a2–h2.

**Piece Rules:**

**Wraith**

- **Movement:** as its move, the Wraith may either (a) move as a **Queen** (orthogonal/diagonal, blocked by pieces), or (b) **teleport to any unoccupied square** on the board.
- **Capturing — costs Essence:** the Wraith may capture by moving as a Queen onto a target, **or** by teleporting onto any occupied enemy square anywhere on the board. **Every Wraith capture costs 1 Essence.**
- **Check — gated by Essence (new):** while the Veil has **≥1 Essence**, the Wraith **gives check as a Queen** (line of sight along ranks/files/diagonals) and can deliver checkmate. At **0 Essence the Wraith is inert** — it cannot capture and **gives no check**; it may only teleport to or move onto empty squares (effectively a third Wisp).
- **Subject to the Behemoth's Armor** (see The Wild): the Wraith may capture a Behemoth only if the square it occupies *before* moving/teleporting is within 2 (Chebyshev) of the Behemoth's current square.

**Wisps**

- As their move, teleport to any unoccupied square, or move as a Rook's single step is **not** granted — a Wisp may **only teleport to an empty square.**
- **Cannot capture.**
- **Can be captured normally** (Counterplay Principle — v1's uncapturable Wisp is removed).
- Do not give check; they block movement and occupy space (including obstructing an enemy king's invasion path).

**Essence (resource)**

- Start **2**, maximum **4**. Public information at all times.
- **Spend:** 1 per Wraith capture. At 0, the Wraith is inert (above).
- **Gain:** +1 whenever a **non-Wraith** Veil piece (Bishop, Knight, or Pawn) captures an enemy **pawn**, up to the cap. The Wraith capturing a pawn does not generate Essence.

**Identity:** The Veil is now a **tempo-and-resource** army rather than a fortress. The Wraith is a teleporting Queen whose offense is metered: a couple of strikes or a checking sequence are available immediately, more must be *earned* by feeding it pawns through conventional captures — and when the well runs dry it degrades into a blocker. Its Wisps are cheap, capturable teleporting obstructers, not an unkillable wall, so the opponent can always clear a path. The opponent must guard pawns carefully (each lost pawn refuels the assassin) while knowing that a Veil at 0 Essence is toothless.

-----

### 6. The Wild

*A bestiary of unorthodox attackers, retuned to sit on-budget and to give the opponent counterplay against its trickiest piece.*

**Composition:** King e1/e8, **Apex** d1/d8 (Queen slot), **Behemoths** a1,h1 (Rook slots), **Stalkers** c1,f1 (Bishop slots), **Broncos** b1,g1 (Knight slots), Pawns a2–h2.

**Piece Rules:**

**Apex**

- Moves as a **Rook OR a Knight** (a chancellor). Captures normally.

**Behemoth**

- Moves up to **3 squares orthogonally**. May capture friendly pieces.
- **Rampage:** on any capture, it must continue in the same direction to its maximum distance (up to 3 squares total), capturing every piece in its path, friendly or enemy. Stops at the board edge or 3 squares.
- **Rampage vs. royals:** a rampage that would pass through or land on a **friendly** King/Warlord is illegal. A rampage threatening an **enemy** royal square is a *rampage check*, resolved like any other check (no piece is literally captured in a king's place); if unavoidable on the prior turn, it is checkmate.
- **Armor (position-based):** the Behemoth can be captured only by an enemy piece occupying a square **within 2 (Chebyshev) of the Behemoth's current square at the start of the capturing move.** Fully board-readable; an adjacent King may capture it.

**Stalker**

- Moves up to **2 squares diagonally.**
- **Strike and Return:** on a capture, the captured piece is removed and the Stalker returns to the square it started the move from. Check is evaluated from the Stalker's home (current) square.
- **Exhaustion (new in v2.0):** after a Strike-and-Return capture, the Stalker is **Exhausted** and **may not capture on the controller's next turn** (it may still move). This gives the opponent a one-turn window to respond to a piece that would otherwise strike defended targets with zero risk.

**Bronco**

- Moves as a standard Knight. May capture friendly pieces (to clear pawns, escape cramps, or open a promotion slot).

**Identity:** Unconventional aggression. The Apex is a near-Queen with leaping agility; the Behemoth is a siege engine that resists long-range fire but can be answered up close; the Stalker ambushes defended pieces but now leaves a window; the Bronco enables sacrifices and promotion tricks. The army's weakness is range: short-stepping pieces develop slowly in open positions.

-----

## Promotion

**Universal rule.** A pawn (or Thrall) reaching the opponent's first rank promotes to a standard FIDE **Queen, Rook, Bishop, or Knight** — never an army-specific piece.

**Replacement only.** A pawn may only promote to a piece type currently below its army's starting count for that slot. Slot mappings:

|Army   |Queen slot      |Rook slots|Bishop slots|Knight slots|
|-------|----------------|----------|------------|------------|
|Crown  |Queen           |Rook      |Bishop      |Knight      |
|Phantom|Shade           |Rook      |Bishop      |Knight      |
|Accord |Herald          |Rook      |Bishop      |Knight      |
|Twins  |Warlord (d-file)|Rook      |Bishop      |Knight      |
|Veil   |Wraith          |Wisp      |Bishop      |Knight      |
|Wild   |Apex            |Behemoth  |Stalker     |Bronco      |

A promoted piece is always a standard FIDE piece with no army abilities (a promoted Veil Rook does not teleport; a promoted Wild Bishop has no Strike-and-Return; an Empowered-eligible promoted Accord piece *does* gain the Banner like any Rook/Bishop/Knight).

**Crown exception.** The Crown may always promote to a **Queen** regardless of how many Queens it has (Royal Abundance). All other Crown slots, and all slots for every other army, obey replacement-only.

**Blocked pawn.** If no promotion slot is open, a pawn may neither push nor capture onto the back rank (both are promotion moves and are illegal in that state). It is stuck on the 7th rank until a slot frees up (e.g., a Bronco/Behemoth self-capture or any trade), retaining all other pawn functions meanwhile.

-----

## Draws

- **Threefold Repetition** of the same position (including side to move and, for the Veil, Essence count).
- **Fifty-Move Rule** (no capture, no pawn/Thrall move for fifty moves by both).
- **Insufficient Material** when neither side can checkmate **and** invasion is impossible for both.

-----

## Notation

Standard algebraic, with extensions.

**Army declaration** is move 0: `1. W=Crown B=Veil`. Codes: `Crown Phantom Accord Twins Veil Wild`.

**Piece letters** follow the FIDE piece each unit replaces (K Q R B N), so notation reads across matchups:

|Letter|Crown |Phantom|Accord|Twins  |Veil  |Wild    |
|------|------|-------|------|-------|------|--------|
|K     |King  |King   |King  |Warlord|King  |King    |
|Q     |Queen |Shade  |Herald|—      |Wraith|Apex    |
|R     |Rook  |Rook   |Rook  |Rook   |Wisp  |Behemoth|
|B     |Bishop|Bishop |Bishop|Bishop |Bishop|Stalker |
|N     |Knight|Knight |Knight|Knight |Knight|Bronco  |

- **Promoted pieces:** `^Q ^R ^B ^N` (e.g., `e8=^Q`).
- **Empowered move (Accord):** no special mark needed — legality is read from the Herald's Banner; annotate with `*` if disambiguation helps (`R*d4`).
- **Twins:** Rally appended after `;` (`Nc6;Kf1`); Shatter as `@` (`K@e4`).
- **Veil:** Wraith captures show Essence change (`Qxe5(E:2→1)`); minor-piece pawn captures that gain Essence (`Nxd5(E:1→2)`); a Wraith **check** while gated is just `+` — note `(E:n)` only when the value changes.
- **Wild:** Behemoth rampage notes the final square (`Rxa4`); a Stalker that becomes Exhausted may be marked `~` (`Bxe6~`).
- **Results:** checkmate `#`, midline invasion `##`, stalemate-loss `(=loss)`.

-----

## Design Notes

v2.0 rebuilds the game on four principles.

**1 — A shared power budget.** v1 armies were tuned by feel, which is why outliers existed. v2.0 targets a standard back rank's material value (Q9 + 2R10 + 2B6 + 2N6 + 8P8 = **~39**, plus the king) and pays for every signature mechanic with a concession. Approximate audit (effective value, including abilities):

|Army   |Queen slot                 |Rook slots      |Bishop/Knight         |Net read                                    |Concession that pays for the upside    |
|-------|---------------------------|----------------|----------------------|--------------------------------------------|---------------------------------------|
|Crown  |Queen (9)                  |10              |12                    |~39, **highest floor**                      |No gimmick; must out-play              |
|Phantom|Shade (~6, can't capture)  |10              |12                    |slightly **under**, buoyed by homing Thralls|Zero capturing material from the Q-slot|
|Accord |Herald (~2)                |10              |12                    |**swings** low→high with the Banner         |Collapses if the Herald dies           |
|Twins  |2 Warlords (royal fighters)|10              |12                    |~on-budget after the fork fix               |Two royal targets; no Queen            |
|Veil   |Wraith (~8, Essence-gated) |Wisps (~4 total)|12                    |~on-budget                                  |Weak rooks; inert at 0 Essence         |
|Wild   |Apex (~8)                  |Behemoths (~10) |Stalkers+Broncos (~14)|trimmed from **over** to ~on-budget         |Short range; Stalker now Exhausts      |

The two prior extremes converge: the Veil loses its passive wall (Wisps capturable) but gains real offense (checking Wraith); the Twins lose their instant-loss fragility; the Wild is trimmed (Stalker Exhaustion, position-based Armor).

**2 — Universal counterplay; no permanent uncapturability.** The single biggest fun and balance fix. v1's uncapturable Shade and Wisps removed the opponent's counterplay and produced passive, drawish positions — and the Twins-only "Shatter destroys uncapturable pieces" exception was a tell that the mechanic needed an escape valve only one army had. v2.0 makes everything capturable and limits survivability by **cost or condition** instead (Behemoth Armor, Wraith Essence). The two surgical patches from the v1.x discussion (Wisp-loses-immunity-while-shielding; the Wraith free-teleport nerf) become unnecessary — they were bandages over uncapturability, which is now gone at the root.

**3 — Diversified win lanes.** v1 funneled half the roster (Phantom, Veil, Twins) into the same midline race because none could checkmate well. v2.0 gives each a distinct *second* threat: the Phantom's **piercing check** (a genuine mating tool), the Veil's **Essence-gated checking Wraith** (surgical mate), and the Twins' action-economy-plus-Shatter tactics. The three no longer play the same game.

**4 — Less hidden bookkeeping.** v1 asked players to recompute an adjacency graph every move (Accord linking), including for check — a landmine for discovered checks and a non-starter for async play. v2.0 replaces it with the **Banner aura**: a single 3×3 zone you read at a glance, with the Herald promoted from a near-useless blocker to the army's capturable keystone. Behemoth Armor is already position-based (board-readable) from v1.2.

Retained from earlier versions: the midline-invasion / stalemate-loss engine (the soul of the game), perfect information, FIDE-only replacement promotion, and the Twins one-action-per-check rule (a principled invariant, not a hack).

**Simulation findings (v2.0.1 — coarse AI self-play, ~30 games, 10 per army).** A faithful engine for all six armies and both win conditions was built and played round-robin by a depth-2 alpha-beta AI with a forcing-line (check) extension. Treat the numbers as *directional*, not precise: the search is shallow, the evaluation is simple, and 10 games per army leaves wide error bars (a single matchup is two games). With those caveats:

- **Standings are AI-skill-sensitive — read them as ordinal hints, not truth.** Across three engine/AI fidelity levels (greedy → check-extension → formation-aware-eval + castling) the order reshuffled each time. The two extremes in the strongest run — Crown (~75%, top) and Accord (~10%, bottom) — are exactly the *simplest* and *most positionally-subtle* armies, so the table is partly measuring how AI-friendly each army is, not pure balance. The robust qualitative findings (no permanently broken army, decisive games, lane diversity, non-transitive matchups) hold; the precise percentages do not. **Twice an army that looked "weak" turned out to be an engine-fidelity bug — Accord's missing empowered-check and Crown's missing castling — so fidelity mattered far more than any balance knob.**
- **The Counterplay Principle held.** Games resolved decisively — only ~2/30 draws, median ~40 plies, essentially none hitting the move cap. v1's passive-fortress failure mode did not reappear once uncapturability was removed.
- **Win lanes diversified once tactics were enabled.** A purely greedy AI ended ~90% of games by invasion; adding the check-extension shifted the mix to roughly **⅔ invasion, ⅓ checkmate, plus a few draws.** So invasion-dominance was largely a weak-AI artifact, *not* evidence that the midline condition is too easy — which is why v2.0.1 leaves the invasion rule unchanged.
- **The Shade bug (above) was caught by the engine, not by review** — the strongest argument for simulating before shipping.
- **AI-sensitivity caveat.** When the AI's Twins were denied their tempo-Rally (an optimization), Twins fell to last (~10%); restoring Rally lifted them to ~60%. The roster's balance is genuinely skill-dependent, so all standings above are provisional.

**Tuning knobs, now data-informed.** (a) **Accord is the one genuine open question.** Against a field that defends its king well (formation-aware AI + castling), Accord went **0-8-2** — its worst showing, and now hard to dismiss as noise. But it is doubly confounded: a greedy bot pilots the subtle positional phalanx worse than any other army, *and* the king-safety eval that makes the AI "better" also makes every opponent turtle — precisely what counters a slow break-through army. So Accord is either the genuinely weakest army or the one most punished by defense-leaning play, and a bot can't separate those. Crucially, **empowerment buffs were proven not to help** (five regimes, ~100 games, all ≈40–50% or worse), so the lever everyone reaches for is a dead end. **No Accord rule changed.** This is the **#1 item for human playtest**: does well-played Accord convert against competent defense? If it truly can't, the fix is a way to *break* a king-safe wall (e.g. making empowered pieces harder to blockade), not more empowerment. (b) **Crown was never weak — its castling was missing from the engine, not the rules.** The early ~30% reading came from an engine that never implemented castling (Crown's defining king-safety mechanic, and per Sirlin the *only* army that castles). Once castling was implemented and the AI valued king safety, Crown rose to the **top of the field (~75%)**. No buff is needed or wanted; the earlier "grow Royal Abundance" suggestion is retracted. If anything Crown's strength validates the power budget — it is standard chess plus the one king-safety tool no other army gets, so the gimmick armies' concessions are real. (c) **Phantom** led under weak defense on the piercing Shade but normalized to ~50% once opponents defended their kings and Crown castled. (d) **Veil/Twins/Wild** land mid-to-upper; Twins' fair number is ~45% (its lower readings came from AI Rally-pruning, not the design).

**Methodology caveat (load-bearing).** These reads come from a shallow AI over small samples. The single clearest lesson of the balance testing: a 10-games-per-variant result ("Queen-empowerment helps, +10%") *reversed* when the sample was doubled. None of the standings above are significant at this scale — they are direction-finding for a future large-sample pass, not verdicts.

-----

## Changelog

### v2.0.1 — Shade Fix, Castling, and Simulation Passes

- **Phantom Shade redefined** from "unblockable check" to **piercing check**: line-of-sight required to *give* check (no through-wall checks, no move-0 mates), interposition disallowed as a *response*. The v2.0 wording was incoherent and game-breaking; a built-from-scratch engine caught an immediate move-0 loss in Phantom-vs-Twins.
- **Behemoth Armor** enforced in the engine on every capture path (including Wraith teleport-captures and rampage).
- **Castling implemented** (engine had omitted it). Crown is the only army that castles — matching Sirlin's Chess 2, where Classic is the sole castling army; it is Crown's intended differentiator. With castling live, Crown rose from last (~30%) to top (~75%) of the field — its earlier weakness was a fidelity bug, not a balance hole. Earlier "buff Crown" note retracted.
- **Simulation findings** added to Design Notes across three AI-fidelity levels (greedy → check-extension → formation-aware eval + castling). Robust results: no permanently broken army, decisive games (counterplay holds), win-lane diversity once tactics are modeled, non-transitive matchups. Invasion rule left unchanged (invasion-dominance was a weak-AI artifact).
- **Accord experiments** (~100 games, five empowerment/eval/reach configs): no intervention helped; against a fully king-safe field Accord went 0-8-2. Confounded by AI piloting difficulty and a defense-leaning eval; buffs proven ineffective. **No rule changed** — flagged as the #1 human-playtest question (can well-played Accord break competent defense?).
- **Net rule change in v2.0.1: only the Shade.** Everything else was engine/AI fidelity and recorded findings; no army values were retuned on shallow-AI data.

### v2.0 — Edition Rebuild

- **Counterplay Principle added (universal):** no piece is permanently uncapturable. The Shade and Wisps are now capturable; the "Shatter destroys uncapturable pieces" clause is retired (moot).
- **Phantom:** Shade is capturable and gives a hard-to-answer check (see v2.0.1 for the corrected definition), replacing its uncapturable status.
- **Accord:** piece-to-piece **linking replaced by the Herald Banner aura** (3×3 Empowerment, +king-step, glanceable). Herald is the capturable keystone. (Tuning knob: Queen-empowerment.)
- **Veil:** Wisps are **capturable**; the Wraith **can now give check** (Queen line of sight) and capture, both **gated by Essence**, and is **inert at 0 Essence**. Repositions the army from defensive wall to resource-gated assassin. (Surgical v1.x Wisp/Wraith patches removed as unnecessary.)
- **Twins:** **one-action-per-check** rule formalized — Rally may complete check resolution only when both Warlords are in check; single checks resolve normally. Removes the instant-loss fork without loosening ordinary mates.
- **Wild:** **Stalker Exhaustion** added (no capture the turn after a Strike-and-Return); confirms position-based **Behemoth Armor**; rebudgeted to ~standard.
- **Crown:** **Royal Abundance** added (may over-promote to Queen) to escape the vanilla trap while keeping a clean identity.
- **Power budget** documented and each army audited against it.

### v1.2 — Rules-Clarity & Consistency Pass

- Accord linking timing resolved; Behemoth Armor rewritten position-based; rampage-vs-King reframed as check; Twins double-royal check rule added; promotion blocked-pawn case clarified.

### v1.1 — Balance Pass

- FIDE-only replacement promotion; Behemoth rampage clarified; Stalker check from home square; Essence notation tightened; threefold includes Essence; promoted Accord pieces link.

### v1.0 — Initial Release

- Six armies; Essence (start 2, max 4); Shatter/Shade interaction; Herald & Rally no-capture; Wraith back-rank restriction removed; Stalker range 2.
