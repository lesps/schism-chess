# S12 Manual Checklist — Army-Special Interaction UX

Run through this checklist after any change to `src/ui/`. Use the dev server (`npm run dev`) at `http://localhost:5173/schism-chess/`.

---

## Cross-cutting (all matchups)

- [ ] **Midline marker**: a subtle horizontal line divides the board at the 50% mark (between ranks 4 and 5).
- [ ] **Invasion indicator**: when a K-slot royal crosses the midline, its square gets a green tint (`hl-invaded`).
- [ ] **No rules logic in UI**: all legality comes from `legalTurns()`; the UI only disambiguates which legal `Turn` the player means.

---

## Twins (any Twins matchup)

### Shatter
- [ ] Select a Warlord → a "💥 Shatter" button appears in the piece-info bar below the board (tapping the selected Warlord again does the same).
- [ ] Clicking Shatter opens the `ShatterPreview` overlay.
- [ ] The overlay lists all adjacent pieces (friendly with amber warning, enemy normally).
- [ ] Clicking **Cancel** closes the overlay and returns to normal selection.
- [ ] Clicking **Confirm** executes the shatter:
  - If rally is available → rally bar appears.
  - If no rally possible → turn advances immediately.
- [ ] Shatter is still offered when the two Warlords stand side by side — the preview never lists a Warlord or King (royals are spared, v2.2).

### Rally
- [ ] After any primary action that has rally variants, a **rally bar** appears below the board: "Rally (optional): tap a pink dot to step a Warlord one square, or skip."
- [ ] Board shows `hl-rally` (red dot) highlights on valid rally destinations.
- [ ] Clicking a rally destination submits the full turn.
- [ ] Clicking **Skip Rally** submits the turn with no rally.
- [ ] Clicking **← Back** cancels the staging phase without submitting (board reverts to White-to-move state with no selection).

### Check feedback
- [ ] When exactly one Warlord is in check, the hint bar shows "Warlord in check — your main move alone must escape it. Rally cannot save a lone checked Warlord." and the header shows a red **Check** badge.
- [ ] A Twins pawn promoting with a Rally available first asks which piece (Rook / Bishop / Knight), then offers the Rally.

---

## Veil (any Veil matchup)

- [ ] Select the Wraith → slide destinations (on queen-lines) show a **solid dot** (`hl-move`).
- [ ] Teleport-move destinations (off queen-lines, empty) show a **dashed dot** (`hl-teleport-move`).
- [ ] Teleport-capture destinations (off queen-lines, enemy piece) show a **dashed ring** (`hl-teleport-capture`).
- [ ] Standard slide captures (on queen-lines, enemy piece) show a **solid ring** (`hl-capture`).
- [ ] After a teleport capture, the Essence meter animates showing the change (e.g., "+1" or "−1").
- [ ] With 0 Essence the Wraith shows only slide moves (no teleport highlights).

---

## Phantom (any Phantom matchup)

### Homing Thralls
- [ ] Select a Thrall → squares that are homing destinations (non-forward empty squares that reduce Chebyshev distance to enemy royal) show an **orange dot** (`hl-homing`).
- [ ] Normal forward push shows standard `hl-move` dot.
- [ ] Diagonal capture shows standard `hl-capture` ring.

### Piercing check
- [ ] When the Phantom Shade gives check, the hint bar shows "Piercing check — blocking is impossible. Move your King or capture the Shade."
- [ ] A check from a Phantom rook/bishop/knight (not the Shade) shows the plain "Check!" hint instead — blocking it is legal.
- [ ] Only king-move destinations and the Shade-capture square are highlighted; no interpose squares are shown.

---

## Accord (any Accord matchup)

### Banner zone
- [ ] When any Accord player has a Herald on the board, the `overlay-banner` tint is visible on squares within Chebyshev-1 of the Herald.
- [ ] If the Herald moves, the banner zone updates immediately on the same turn.

### Concord (v2.3)
- [ ] Friendly Knight/Bishop/Rook pieces in the banner zone show a **✦ badge** (`piece-badge-empowered`) when at least two distinct slots share the zone.
- [ ] Selecting a Knight in Concord with a Rook shows rook-slide destinations beyond its native jumps (and vice versa).
- [ ] A lone piece in the Banner shows no badge and gains no bonus moves.
- [ ] If the Herald is captured or moves away, the badge disappears on the opponent's next view.

### The March (v2.3)
- [ ] Tapping the Herald then an empty adjacent square offers "Move the Herald alone" vs "March" in the chooser when another Banner piece can step.
- [ ] The March preview lists every piece that will step and its destination; confirming steps the whole formation; blocked pieces hold; nothing is captured.

### Herald moves
- [ ] Selecting the Herald shows only empty squares as destinations (Herald cannot capture).
- [ ] Herald destinations use standard `hl-move` dot.

---

## Wild (any Wild matchup)

### Rampage
- [ ] Select the Behemoth → valid capture destinations show `hl-special` (no separate visual from standard-special currently).
- [ ] Clicking a rampage destination opens the `RampagePreview` overlay showing the full chain of victims.
- [ ] Friendly pieces in the rampage path appear with an amber "friendly" warning.
- [ ] Clicking **Cancel** closes the overlay without submitting.
- [ ] Clicking **Confirm** executes the rampage and advances the turn.

### Behemoth Armor
- [ ] When the Behemoth is selected, squares within Chebyshev-2 of it show the `overlay-armor` tint.
- [ ] Enemies outside that radius cannot capture the Behemoth (they have no highlight on the Behemoth's square when selected).

### Exhausted Stalker
- [ ] After a Stalker makes a strike capture, its home square is added to `exhausted`.
- [ ] On the next turn, the Stalker at the exhausted square shows a **⊗ badge** (`piece-badge-exhausted`) and renders at 50% opacity.
- [ ] Selecting the exhausted Stalker shows the hint "Stalker is Exhausted — it may move this turn, but not capture."
- [ ] No capture highlights (`hl-special` for strike) appear for the exhausted Stalker.
- [ ] Non-capture diagonal moves still show `hl-move`.
- [ ] On the turn after exhaustion, the badge disappears and captures are legal again.
- [ ] If the opponent captures the exhausted Stalker, the capturing piece is **not** shown exhausted.

### Friendly captures (Bronco / Behemoth)
- [ ] Wild pieces that can capture friendly pieces show those destinations with `hl-friendly-capture` (amber ring).
- [ ] The chooser sheet opens with a warning when a friendly capture is clicked with a single-turn destination.

---

## End-to-end smoke (play a short game per army)

- [ ] **Twins vs Crown**: complete a game that includes a Shatter, a rally, and a Twins invasion win.
- [ ] **Veil vs Crown**: complete a game that includes a teleport-capture and an Essence change.
- [ ] **Phantom vs Crown**: complete a game where the Phantom Shade gives check, and the opponent captures the Shade to escape.
- [ ] **Accord vs Crown**: complete a game where a piece in Concord delivers checkmate or invasion.
- [ ] **Wild vs Crown**: complete a game with a Rampage and an Exhausted Stalker turn.
