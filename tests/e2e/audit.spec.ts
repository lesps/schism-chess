import { test, expect, Page } from '@playwright/test';

// Regression tests for the v1.3 audit pass: state that used to be lost, flows that
// used to dead-end, and the new interaction affordances (drag, undo, back button).

const BASE = '/schism-chess/';

async function startCrownGame(page: Page) {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'New local game' }).click();
  await page.getByRole('button', { name: 'The Crown', exact: true }).click();
  await page.getByRole('button', { name: 'Done →' }).click();
  await page.getByRole('button', { name: 'Player 2 is ready →' }).click();
  await page.getByRole('button', { name: 'The Crown', exact: true }).click();
  await page.getByRole('button', { name: 'Done →' }).click();
  await page.getByTestId('start-game').click();
  await expect(page.getByText('White to move')).toBeVisible();
}

async function move(page: Page, from: number, to: number) {
  await page.click(`[data-sq="${from}"]`);
  await page.click(`[data-sq="${to}"]`);
}

test('opening the rules mid-game keeps the position', async ({ page }) => {
  await startCrownGame(page);
  await move(page, 12, 28); // e4
  await expect(page.getByText('Black to move')).toBeVisible();

  await page.getByTestId('game-rules-btn').click();
  await expect(page.getByRole('heading', { name: 'Win Conditions' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();

  await expect(page.getByText('Black to move')).toBeVisible();
  await expect(page.locator('.move-san').first()).toHaveText('e4');
  await expect(page.locator('[data-sq="28"] [data-slot="P"]')).toBeVisible();
});

test('opening an army\'s rules from the picker keeps the pick', async ({ page }) => {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'New local game' }).click();
  await page.getByRole('button', { name: 'The Phantom', exact: true }).click();
  await page.getByRole('button', { name: 'Rules for The Phantom' }).click();
  await expect(page.getByRole('heading', { name: '2. The Phantom' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'The Phantom', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('a resumed game keeps its move list and last-move highlight', async ({ page }) => {
  await startCrownGame(page);
  await move(page, 12, 28); // e4
  await move(page, 52, 36); // e5
  await page.reload();
  await expect(page.getByText('White to move')).toBeVisible();
  await expect(page.locator('.move-san')).toHaveText(['e4', 'e5']);
  await expect(page.locator('[data-sq="36"]')).toHaveClass(/hl-last-to/);
});

test('undo takes back a move and the takeback survives a refresh', async ({ page }) => {
  await startCrownGame(page);
  await move(page, 12, 28);
  await expect(page.getByText('Black to move')).toBeVisible();
  await page.getByTestId('undo-btn').click();
  await expect(page.getByText('White to move')).toBeVisible();
  await expect(page.locator('.move-san')).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('White to move')).toBeVisible();
  await expect(page.locator('.move-san')).toHaveCount(0);
});

test('pieces can be dragged to a square', async ({ page }) => {
  await startCrownGame(page);
  const from = await page.locator('[data-sq="11"]').boundingBox(); // d2
  const to = await page.locator('[data-sq="27"]').boundingBox();   // d4
  if (!from || !to) throw new Error('no board');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText('Black to move')).toBeVisible();
  await expect(page.locator('[data-sq="27"] [data-slot="P"]')).toBeVisible();
});

test('browser Back closes the rules, then returns home', async ({ page }) => {
  await startCrownGame(page);
  await page.getByTestId('game-rules-btn').click();
  await expect(page.getByRole('heading', { name: 'Win Conditions' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Win Conditions' })).not.toBeVisible();
  await expect(page.getByText('White to move')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('new-local-game')).toBeVisible();
  // …and the game is waiting on the home screen
  await expect(page.getByTestId('continue-game')).toBeVisible();
});

test('deleting a game from My games stays on the list', async ({ page }) => {
  await startCrownGame(page);
  await page.getByRole('button', { name: 'Go to home' }).click();
  await page.getByTestId('games-list').click();
  const rows = page.locator('[data-testid^="game-row-"]');
  await expect(rows).toHaveCount(1);
  const del = page.locator('[data-testid^="delete-"]');
  await del.click();
  await expect(del).toHaveText('Delete?');
  await del.click();
  await expect(rows).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'My games' })).toBeVisible();
});

test('refreshing after opening a game link resumes instead of reporting a conflict', async ({ browser }) => {
  const { createHash } = await import('node:crypto');
  const hasher = { sha256: async (s: string) => createHash('sha256').update(s).digest('hex') };
  const { createGame, respondToCommit, revealArmy, encodePayload } = await import('../../src/pbm/index');
  const SALT = 'bb'.repeat(16);
  let payload = await createGame('Alice', 'W', 'Crown', SALT, hasher);
  payload = respondToCommit(payload, 'Bob', 'Crown');
  payload = await revealArmy(payload, 'Crown', SALT, hasher);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // This device is Alice's (White)
  await ctx.addInitScript(({ id }) => {
    localStorage.setItem(`schism-meta-${id}`, JSON.stringify({ myColor: 'W' }));
  }, { id: payload.gameId });

  await page.goto(`${BASE}#g=${encodePayload(payload)}`);
  await expect(page.getByText(/White to move/)).toBeVisible({ timeout: 8000 });
  await move(page, 12, 28);
  await expect(page.getByTestId('share-url')).toBeVisible();
  await page.getByTestId('back-to-game').click();
  // The link is consumed: the address bar no longer carries it
  expect(page.url()).not.toContain('#g=');

  await page.reload();
  await expect(page.getByTestId('conflict-keep')).not.toBeVisible();
  await expect(page.getByText('Black to move')).toBeVisible({ timeout: 8000 });
  // Waiting on Bob — the link can be shared again
  await page.getByTestId('reshare-btn').click();
  await expect(page.getByTestId('share-url')).toBeVisible();
  await ctx.close();
});

test('PBM: the board stays on your side while you wait', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const gameId = 'orientation-test';
  const payload = {
    v: 1, gameId, phase: 'play',
    white: { label: 'Alice' }, black: { label: 'Bob' },
    commit: { by: 'W', hash: '0'.repeat(64) },
    armies: { W: 'Crown', B: 'Crown' },
    moves: [], result: null,
  };
  await ctx.addInitScript(({ id, p }) => {
    localStorage.setItem(`schism-game-${id}`, JSON.stringify(p));
    localStorage.setItem(`schism-meta-${id}`, JSON.stringify({ myColor: 'B' }));
    sessionStorage.setItem('lastGameId', id);
  }, { id: gameId, p: payload });
  await page.goto(BASE);
  await expect(page.getByTestId('waiting-banner')).toContainText('Alice');
  // Black's view: h1 is the top-left square
  await expect(page.locator('.board-sq').first()).toHaveAttribute('data-sq', '7');
  await ctx.close();
});

test('re-opening your own response link shows it again instead of "commitment lost"', async ({ page }) => {
  const { createHash } = await import('node:crypto');
  const hasher = { sha256: async (s: string) => createHash('sha256').update(s).digest('hex') };
  const { createGame, encodePayload } = await import('../../src/pbm/index');
  const challenge = await createGame('Alice', 'W', 'Crown', 'cc'.repeat(16), hasher, 'Bob');

  // Bob opens the challenge: his suggested name is pre-filled
  await page.goto(`${BASE}#g=${encodePayload(challenge)}`);
  await expect(page.getByTestId('respond-label')).toHaveValue('Bob');
  await page.getByRole('button', { name: 'The Wild', exact: true }).click();
  await page.getByTestId('respond-submit').click();
  const responseUrl = (await page.getByTestId('share-url').inputValue()).trim();

  // Later Bob taps his own response link in the chat
  await page.goto(BASE);
  await page.goto(responseUrl);
  await expect(page.getByRole('heading', { name: 'Send your response' })).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('salt-missing')).not.toBeVisible();

  // …and re-opening the original challenge doesn't regress the stored game either
  await page.goto(BASE);
  await page.goto(`${BASE}#g=${encodePayload(challenge)}`);
  await expect(page.getByRole('heading', { name: 'Send your response' })).toBeVisible({ timeout: 8000 });
});
