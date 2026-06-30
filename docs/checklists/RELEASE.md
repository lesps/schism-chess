# Release Checklist — Schism Chess v1.0.0

Execute this checklist on a real phone against the deployed app before tagging.

## Setup

- [ ] Open the deployed URL: https://lesps.github.io/schism-chess/
- [ ] Confirm the page loads without console errors
- [ ] Confirm the version in the title / About section is v1.0.0

---

## 1. Local hotseat game

- [ ] Tap "New local game"
- [ ] Player 1 picks an army — confirm card highlights with army color
- [ ] Tap the "?" link on an army card — confirm it opens the rules at the right army section
- [ ] Confirm handover screen appears; Player 2 picks a different army
- [ ] Reveal screen shows both army names with correct colors
- [ ] Play at least 3 moves; confirm SAN move list updates after each
- [ ] Confirm board auto-flips on each turn
- [ ] Use the flip-lock button; confirm orientation freezes
- [ ] Make a move by typing SAN in the input (e.g. `e4`) — confirm it plays
- [ ] Type an invalid SAN (e.g. `Nf9`) — confirm inline error appears
- [ ] Undo the SAN error by clearing and retyping
- [ ] Confirm refresh resumes the same game

---

## 2. Army special: each army touched once

### Crown
- [ ] Confirm castling (O-O or O-O-O) is available and plays correctly

### Phantom
- [ ] Select the Shade — confirm piercing-check hint bar appears when giving check
- [ ] Move a Thrall toward the enemy king — confirm homing move dot (orange) appears

### Accord
- [ ] Move the Herald — confirm Banner zone overlay appears around it
- [ ] Place a Knight/Bishop/Rook in the Banner zone — confirm empowered (✦) badge appears
- [ ] Confirm the empowered piece shows extra destinations

### Twins
- [ ] Move a Warlord — confirm Shatter button appears in the bar
- [ ] Trigger Shatter — confirm preview list of doomed pieces
- [ ] After a Warlord move, confirm rally destinations appear (red dots)
- [ ] Tap Skip rally — confirm turn advances without rally

### Veil
- [ ] Select Wraith with Essence — confirm slide and teleport destinations are distinct (solid vs. dashed)
- [ ] Confirm Essence meter decrements after a teleport capture
- [ ] Confirm Wisp teleport destinations show dashed dots

### Wild
- [ ] Select Behemoth — confirm armor zone overlay appears
- [ ] Trigger a rampage capture — confirm preview sheet lists all captured pieces
- [ ] After a Stalker strike, confirm exhausted badge (⊗) appears
- [ ] Confirm exhausted Stalker shows no capture destinations

---

## 3. Win conditions

- [ ] Play to checkmate — confirm end modal shows army name and win reason
- [ ] Confirm "See rules" link in modal opens the correct rules section
- [ ] Confirm "New game" returns to home
- [ ] (Optional) Play to midline invasion — confirm invasion win modal

---

## 4. Play by mail (two-device simulation)

Use two browser tabs (or two devices) to simulate a PBM game.

- [ ] Tab A: "Play by mail" → fill in label, pick color, pick army → copy share link
- [ ] Tab B: Import the share link → pick responding army → copy response link
- [ ] Tab A: Import the response → auto-reveal → copy play link
- [ ] Tab B: Import play link → confirm game starts
- [ ] Tab A: Make a move → copy share link
- [ ] Tab B: Import move → confirm board updates
- [ ] Confirm "My games" list shows the game on both tabs

---

## 5. Rules reference

- [ ] From the home screen, tap "Rules" — confirm rules page loads
- [ ] Confirm all 6 army sections are present and readable
- [ ] Confirm in-page anchors work (tap a Table of Contents link)
- [ ] Confirm "Back" returns to home

---

## 6. Accessibility

- [ ] Tab through the board using keyboard — confirm visible focus rings on squares
- [ ] Type a full game move using only keyboard (SAN input)
- [ ] Confirm move list announces each new move (screen-reader live region)

---

## 7. Refresh / resume

- [ ] Start a local game, make 2 moves, close the tab
- [ ] Reopen the URL — confirm the game resumes at the correct position

---

## Results

<!-- Fill in after executing -->

Date: ___________  
Device: ___________  
Browser: ___________  

| Section | Pass / Fail / N/A | Notes |
|---------|-------------------|-------|
| 1. Local hotseat | | |
| 2. Army specials | | |
| 3. Win conditions | | |
| 4. Play by mail | | |
| 5. Rules reference | | |
| 6. Accessibility | | |
| 7. Refresh/resume | | |

Overall: **PASS / FAIL**

Signed off by: ___________
