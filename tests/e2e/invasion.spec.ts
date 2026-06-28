import { test, expect } from '@playwright/test';

// Invasion test: White King at d4, Black King at h8, White to move.
// Kd4-d5 → rank 4 (0-indexed) = rank 5 from White's side → invasion win.
//
// SFEN: 7k/8/8/8/3K4/8/8/8/w/Crown,Crown/-/-/0,0/-/0/1
// d4 = sq 27 (rank 3, file 3), d5 = sq 35 (rank 4, file 3)

const INVASION_SFEN = '7k/8/8/8/3K4/8/8/8/w/Crown,Crown/-/-/0,0/-/0/1';

test.describe('Invasion win via ?sfen= dev loader', () => {
  test('Crown king invades — win modal appears', async ({ page }) => {
    const sfenEncoded = encodeURIComponent(INVASION_SFEN);
    await page.goto(`/schism-chess/?sfen=${sfenEncoded}`);

    // Should land on game screen directly (dev loader)
    await expect(page.getByText('White to move')).toBeVisible({ timeout: 5000 });

    // White King d4 → d5 (invasion)
    await page.click('[data-sq="27"]'); // d4
    await page.click('[data-sq="35"]'); // d5

    // Invasion modal
    await expect(page.getByText('The Crown wins')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/midline/i)).toBeVisible();
  });

  test('after invasion, New game button returns to home', async ({ page }) => {
    const sfenEncoded = encodeURIComponent(INVASION_SFEN);
    await page.goto(`/schism-chess/?sfen=${sfenEncoded}`);

    await page.click('[data-sq="27"]');
    await page.click('[data-sq="35"]');

    await expect(page.getByText('The Crown wins')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'New game' }).click();
    await expect(page.getByText('Schism Chess')).toBeVisible();
  });
});
