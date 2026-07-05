import { test, expect } from '@playwright/test';

async function startLocalGame(page: import('@playwright/test').Page) {
  await page.goto('/schism-chess/');
  await page.getByRole('button', { name: 'New local game' }).click();
  await page.getByRole('button', { name: "I'm ready →" }).click();
  await page.getByRole('button', { name: 'The Crown', exact: true }).click();
  await page.getByRole('button', { name: 'Done →' }).click();
  await page.getByRole('button', { name: 'Player 2 is ready →' }).click();
  await page.getByRole('button', { name: "I'm ready →" }).click();
  await page.getByRole('button', { name: 'The Crown', exact: true }).click();
  await page.getByRole('button', { name: 'Done →' }).click();
  await page.getByTestId('start-game').click();
}

test.describe('SAN input — keyboard play', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/schism-chess/');
  });

  test('plays a move via SAN input box', async ({ page }) => {
    await startLocalGame(page);
    await expect(page.getByText('White to move')).toBeVisible();

    const sanInput = page.getByTestId('san-input');
    await expect(sanInput).toBeVisible();
    await expect(sanInput).toBeEnabled();

    // Type e4 and press Enter
    await sanInput.click();
    await sanInput.fill('e4');
    await sanInput.press('Enter');

    // The input should be cleared after a valid move
    await expect(sanInput).toHaveValue('');

    // The move should appear in the move list
    await expect(page.getByText('e4')).toBeVisible();

    // It should now be Black's turn
    await expect(page.getByText('Black to move')).toBeVisible();
  });

  test('shows inline error for invalid SAN', async ({ page }) => {
    await startLocalGame(page);

    const sanInput = page.getByTestId('san-input');
    await sanInput.click();
    await sanInput.fill('Nf9'); // invalid square
    await sanInput.press('Enter');

    // Error appears
    const error = page.getByTestId('san-error');
    await expect(error).toBeVisible();

    // No move was played — still White's turn
    await expect(page.getByText('White to move')).toBeVisible();
  });

  test('can play a complete Knight move via SAN', async ({ page }) => {
    await startLocalGame(page);

    const sanInput = page.getByTestId('san-input');
    await sanInput.click();
    await sanInput.fill('Nf3');
    await sanInput.press('Enter');

    await expect(sanInput).toHaveValue('');
    await expect(page.getByText('Nf3')).toBeVisible();
    await expect(page.getByText('Black to move')).toBeVisible();
  });

  test('Rules link appears on home screen', async ({ page }) => {
    await expect(page.getByTestId('rules-link')).toBeVisible();
    await page.getByTestId('rules-link').click();
    // Rules screen should show (heading role: the TOC link shares the text)
    await expect(page.getByRole('heading', { name: 'Win Conditions' })).toBeVisible();
  });
});
