import { test, expect } from '@playwright/test';

// Square indices: rank * 8 + file  (rank 0 = White's 1st rank, file 0 = a-file)
// a1=0, h1=7, a2=8 … h8=63

function sfenUrl(sfen: string): string {
  return `/schism-chess/?sfen=${encodeURIComponent(sfen)}`;
}

// ── SFEN fixtures ──────────────────────────────────────────────────────────────

// Twins: White Warlords at d4(27) and g4(30) — Chebyshev-3 apart (shatter legal).
// Black pawn at e5(36) — adjacent to d4 Warlord, appears in Shatter victim list.
// Black King at h8(63). White to move.
const TWINS_SFEN = '7k/8/8/4p3/3K2K1/8/8/8/w/Twins,Crown/-/-/0,0/-/0/1';

// Veil: White Wraith(Q-slot) at c4(26). Essence=2. Black rook at e7(52).
// e7 is NOT on the queen-line from c4 (diff rank+3 file+2) → only reachable by
// teleport capture. c5(34) is on the c-file → slide destination (hl-move).
// Black King at h8(63), White King at a1(0). White to move.
const VEIL_SFEN = '7k/4r3/8/8/2Q5/8/8/K7/w/Veil,Crown/-/-/2,0/-/0/1';

// Phantom: White Shade(Q-slot) at e6(44) gives piercing check to Black King at
// e8(60) — same file, e7 is empty. Black Rook at e3(20) can capture Shade.
// White King at a1(0). Black to move → opponentArmy = 'Phantom' → hint bar shows.
const PHANTOM_SFEN = '4k3/8/4Q3/8/8/4r3/8/K7/b/Phantom,Crown/-/-/0,0/-/0/1';

// Accord: White Herald(Q-slot) at d4(27), White Knight(N-slot) at e5(36).
// Knight is within Chebyshev-1 of Herald → Empowered (gains king-step bonus moves).
// Black King at h8(63), White King at a1(0). White to move.
const ACCORD_SFEN = '7k/8/8/4N3/3Q4/8/8/K7/w/Accord,Crown/-/-/0,0/-/0/1';

// Wild — Rampage: White Behemoth(R-slot) at d4(27). Black Crown rooks at
// e4(28) and f4(29) — both within Chebyshev-2 of d4 so the armor-wall rule
// does NOT truncate the rampage path. Behemoth rampages east to g4(30),
// clearing e4 and f4. RampageMove.to = 30; captures = [28, 29].
// Black King at h8(63), White King at a1(0). White to move.
const WILD_RAMPAGE_SFEN = '7k/8/8/8/3Rrr2/8/8/K7/w/Wild,Crown/-/-/0,0/-/0/1';

// Wild — Exhausted Stalker: White Stalker(B-slot) at d4(27); d4 listed as
// exhausted. Black Crown rook at f6(45) on diagonal — normally a strike target,
// but exhausted Stalker cannot capture. e5(36) remains a legal non-capture move.
// Black King at h8(63), White King at a1(0). White to move.
const WILD_EXHAUSTED_SFEN = '7k/8/5r2/8/3B4/8/8/K7/w/Wild,Crown/-/-/0,0/d4/0/1';

// ─────────────────────────────────────────────────────────────────────────────
// Twins — Shatter and Rally
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Twins — Shatter and Rally', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(sfenUrl(TWINS_SFEN));
    await expect(page.getByText('White to move')).toBeVisible({ timeout: 5000 });
  });

  test('Shatter button appears when Warlord selected; preview lists victim; skip rally submits', async ({ page }) => {
    // Select d4 Warlord (sq 27); adjacent pawn at e5 means shatter is interesting
    await page.click('[data-sq="27"]');

    // Shatter mode button should appear
    await expect(page.getByTestId('shatter-mode-btn')).toBeVisible();

    // Open Shatter preview
    await page.click('[data-testid="shatter-mode-btn"]');
    await expect(page.getByTestId('shatter-preview')).toBeVisible();

    // e5 pawn (sq 36) is adjacent to d4 → listed as victim
    await expect(page.getByTestId('shatter-victim-36')).toBeVisible();

    // Confirm shatter
    await page.click('[data-testid="shatter-confirm"]');

    // Rally bar appears (g4 Warlord can rally after the shatter)
    await expect(page.getByTestId('rally-bar')).toBeVisible();

    // Skip rally → full turn submitted
    await page.click('[data-testid="rally-skip"]');
    await expect(page.getByText('Black to move')).toBeVisible({ timeout: 5000 });
  });

  test('normal Warlord move enters rally phase; clicking rally destination submits turn', async ({ page }) => {
    // d4 Warlord (27) steps to d5 (35) — a normal king-step
    await page.click('[data-sq="27"]');
    await page.click('[data-sq="35"]');

    // Rally bar appears for the g4 Warlord to optionally move
    await expect(page.getByTestId('rally-bar')).toBeVisible();

    // Rally g4 Warlord (30) to g5 (38) — adjacent empty square
    await page.click('[data-sq="38"]');
    await expect(page.getByText('Black to move')).toBeVisible({ timeout: 5000 });
  });

  test('Back button in rally bar cancels staging without submitting move', async ({ page }) => {
    await page.click('[data-sq="27"]');
    await page.click('[data-sq="35"]');
    await expect(page.getByTestId('rally-bar')).toBeVisible();

    // Back cancels — no move committed
    await page.click('[data-testid="rally-back"]');

    await expect(page.getByTestId('rally-bar')).not.toBeVisible();
    await expect(page.getByText('White to move')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Veil — slide vs teleport destination highlights
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Veil — slide vs teleport highlights', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(sfenUrl(VEIL_SFEN));
    await expect(page.getByText('White to move')).toBeVisible({ timeout: 5000 });
  });

  test('Wraith destinations: slide square gets hl-move, off-line enemy gets hl-teleport-capture', async ({ page }) => {
    // Click Wraith at c4 (sq 26)
    await page.click('[data-sq="26"]');

    // c5 (sq 34) is one rank north on the c-file → standard slide → hl-move
    await expect(page.locator('[data-sq="34"]')).toHaveClass(/hl-move/);

    // e7 (sq 52) has a Black rook and is not on the queen-line from c4
    // (rank diff +3, file diff +2) → only reachable by teleport capture
    await expect(page.locator('[data-sq="52"]')).toHaveClass(/hl-teleport-capture/);
  });

  test('teleport capture executes and advances the turn', async ({ page }) => {
    await page.click('[data-sq="26"]');
    await page.click('[data-sq="52"]');  // teleport capture of e7 rook
    await expect(page.getByText('Black to move')).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phantom — piercing check
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Phantom — piercing check', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(sfenUrl(PHANTOM_SFEN));
    await expect(page.getByText('Black to move')).toBeVisible({ timeout: 5000 });
  });

  test('hint bar shows piercing-check banner when Shade gives check', async ({ page }) => {
    await expect(page.getByRole('status')).toContainText('Piercing check');
  });

  test('Black rook can capture Shade on e6 to escape piercing check', async ({ page }) => {
    // Click Black rook at e3 (sq 20)
    await page.click('[data-sq="20"]');

    // Shade at e6 (sq 44) is on the same file → legal capture → hl-capture
    await expect(page.locator('[data-sq="44"]')).toHaveClass(/hl-capture/);

    // Capture the Shade — resolves check
    await page.click('[data-sq="44"]');
    await expect(page.getByText('White to move')).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Accord — empowered Knight in Banner zone
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Accord — empowered Knight in Banner zone', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(sfenUrl(ACCORD_SFEN));
    await expect(page.getByText('White to move')).toBeVisible({ timeout: 5000 });
  });

  test('Knight within Herald banner zone shows empowered badge', async ({ page }) => {
    // Knight at e5 (sq 36) is Chebyshev-1 from Herald at d4 (sq 27) → empowered
    await expect(page.locator('[data-sq="36"] [data-empowered="true"]')).toBeVisible();
  });

  test('empowered Knight has more than 8 legal destinations', async ({ page }) => {
    await page.click('[data-sq="36"]');

    // Standard Knight has ≤ 8 moves; the Nightrider rides add extended destinations
    const destCount = await page.locator('[data-sq].hl-move, [data-sq].hl-capture').count();
    expect(destCount).toBeGreaterThan(8);
  });

  test('empowered Knight can execute a Nightrider ride', async ({ page }) => {
    await page.click('[data-sq="36"]');

    // g1 (sq 6) is two knight-leaps from e5 along (-2,+1) via empty f3 —
    // an empowered Nightrider ride, not a native knight move -> hl-move
    await expect(page.locator('[data-sq="6"]')).toHaveClass(/hl-move/);

    await page.click('[data-sq="6"]');
    await expect(page.getByText('Black to move')).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wild — Behemoth rampage
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Wild — Behemoth rampage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(sfenUrl(WILD_RAMPAGE_SFEN));
    await expect(page.getByText('White to move')).toBeVisible({ timeout: 5000 });
  });

  test('Behemoth capture shows rampage preview with full victim chain', async ({ page }) => {
    // Select Behemoth at d4 (sq 27)
    await page.click('[data-sq="27"]');

    // g4 (sq 30) is the empty rampage endpoint (3 east of d4); clicking it opens preview.
    // The armor-wall rule applies to R-slot pieces at Chebyshev > 2, so the two rooks
    // are placed at e4(28) and f4(29) — both within Chebyshev-2.
    // RampageMove.to = 30; captures = [28 (e4 rook), 29 (f4 rook)]
    await page.click('[data-sq="30"]');

    await expect(page.getByTestId('rampage-preview')).toBeVisible();

    // Both rooks (e4=28 and f4=29) must appear in the victim list
    await expect(page.getByTestId('rampage-victim-28')).toBeVisible();
    await expect(page.getByTestId('rampage-victim-29')).toBeVisible();
  });

  test('confirming rampage preview submits the turn', async ({ page }) => {
    await page.click('[data-sq="27"]');
    await page.click('[data-sq="30"]');
    await expect(page.getByTestId('rampage-preview')).toBeVisible();

    await page.click('[data-testid="rampage-confirm"]');
    await expect(page.getByText('Black to move')).toBeVisible({ timeout: 5000 });
  });

  test('cancelling rampage preview keeps the turn un-submitted', async ({ page }) => {
    await page.click('[data-sq="27"]');
    await page.click('[data-sq="30"]');
    await expect(page.getByTestId('rampage-preview')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByTestId('rampage-preview')).not.toBeVisible();
    await expect(page.getByText('White to move')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wild — exhausted Stalker
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Wild — exhausted Stalker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(sfenUrl(WILD_EXHAUSTED_SFEN));
    await expect(page.getByText('White to move')).toBeVisible({ timeout: 5000 });
  });

  test('exhausted Stalker renders exhausted badge', async ({ page }) => {
    // Stalker at d4 (sq 27) listed as exhausted in SFEN → data-exhausted="true"
    await expect(page.locator('[data-sq="27"] [data-exhausted="true"]')).toBeVisible();
  });

  test('selecting exhausted Stalker shows hint and no capture highlight on enemy piece', async ({ page }) => {
    await page.click('[data-sq="27"]');

    // Hint bar should mention exhaustion
    await expect(page.getByRole('status')).toContainText('Exhausted');

    // f6 (sq 45) has a Black rook; normally a strike target, but no highlight while exhausted
    await expect(page.locator('[data-sq="45"]')).not.toHaveClass(/hl-capture|hl-special/);
  });

  test('exhausted Stalker can still move non-capture diagonally', async ({ page }) => {
    await page.click('[data-sq="27"]');

    // e5 (sq 36) is a diagonal non-capture (one step NE) → hl-move
    await expect(page.locator('[data-sq="36"]')).toHaveClass(/hl-move/);

    await page.click('[data-sq="36"]');
    await expect(page.getByText('Black to move')).toBeVisible({ timeout: 5000 });
  });
});
