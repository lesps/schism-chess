import { test, expect } from '@playwright/test';

// Scholar's Mate: 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6?? 4.Qxf7#
// Square indices: rank * 8 + file, rank 0 = White's 1st rank, file 0 = a-file

async function startNewGame(page: import('@playwright/test').Page, armyW = 'The Crown', armyB = 'The Crown') {
  await page.getByRole('button', { name: 'New local game' }).click();

  // P1 privacy
  await page.getByRole('button', { name: "I'm ready →" }).click();
  // P1 picks army
  await page.getByRole('button', { name: armyW }).click();
  await page.getByRole('button', { name: 'Done →' }).click();

  // Handover
  await page.getByRole('button', { name: 'Player 2 is ready →' }).click();

  // P2 privacy
  await page.getByRole('button', { name: "I'm ready →" }).click();
  // P2 picks army
  await page.getByRole('button', { name: armyB }).click();
  await page.getByRole('button', { name: 'Done →' }).click();

  // Reveal → start
  await page.getByTestId('start-game').click();
}

test.describe('Crown vs Crown hotseat — full game', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/schism-chess/');
  });

  test("complete Scholar's Mate sequence to checkmate modal", async ({ page }) => {
    await startNewGame(page);

    await expect(page.getByText('White to move')).toBeVisible();

    // Move 1: White e2-e4 (sq 12 → sq 28)
    await page.click('[data-sq="12"]');
    await page.click('[data-sq="28"]');

    // Move 1: Black e7-e5 (sq 52 → sq 36)
    await page.click('[data-sq="52"]');
    await page.click('[data-sq="36"]');

    // Move 2: White Qd1-h5 (sq 3 → sq 39)
    await page.click('[data-sq="3"]');
    await page.click('[data-sq="39"]');

    // Move 2: Black Nb8-c6 (sq 57 → sq 42)
    await page.click('[data-sq="57"]');
    await page.click('[data-sq="42"]');

    // Move 3: White Bf1-c4 (sq 5 → sq 26)
    await page.click('[data-sq="5"]');
    await page.click('[data-sq="26"]');

    // Move 3: Black Ng8-f6 (sq 62 → sq 45)
    await page.click('[data-sq="62"]');
    await page.click('[data-sq="45"]');

    // Move 4: White Qh5xf7# (sq 39 → sq 53)
    await page.click('[data-sq="39"]');
    await page.click('[data-sq="53"]');

    // Game end modal
    await expect(page.getByText('The Crown wins')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/checkmate/i)).toBeVisible();
  });

  test('move list shows SAN after first move', async ({ page }) => {
    await startNewGame(page);

    // White e2-e4
    await page.click('[data-sq="12"]');
    await page.click('[data-sq="28"]');

    await expect(page.locator('.move-san').first()).toContainText('e4');
  });

  test('army picker shows all six armies', async ({ page }) => {
    await page.getByRole('button', { name: 'New local game' }).click();
    await page.getByRole('button', { name: "I'm ready →" }).click();

    for (const army of ['The Crown', 'The Phantom', 'The Accord', 'The Twins', 'The Veil', 'The Wild']) {
      await expect(page.getByRole('button', { name: army })).toBeVisible();
    }
  });

  test('back from privacy screen returns to home', async ({ page }) => {
    await page.getByRole('button', { name: 'New local game' }).click();
    await page.getByRole('button', { name: '← Back' }).click();
    await expect(page.getByText('Schism Chess')).toBeVisible();
  });
});
