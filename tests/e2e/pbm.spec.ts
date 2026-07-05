import { test, expect, Page, BrowserContext } from '@playwright/test';

const BASE = '/schism-chess/';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Read the share URL from the ShareScreen. */
async function getShareUrl(page: Page): Promise<string> {
  const input = page.getByTestId('share-url');
  await expect(input).toBeVisible({ timeout: 8000 });
  return (await input.inputValue()).trim();
}

/** Click a square on the board. */
async function clickSq(page: Page, sq: number) {
  await page.click(`[data-sq="${sq}"]`);
}

// ─── Full PBM game: two contexts, Fool's Mate ─────────────────────────────────

test.describe('PBM: two-context full game', () => {
  let ctxA: BrowserContext;
  let ctxB: BrowserContext;
  let pageA: Page;
  let pageB: Page;

  test.beforeEach(async ({ browser }) => {
    ctxA = await browser.newContext();
    ctxB = await browser.newContext();
    pageA = await ctxA.newPage();
    pageB = await ctxB.newPage();
  });

  test.afterEach(async () => {
    await ctxA.close();
    await ctxB.close();
  });

  test("Fool's Mate via URL exchange", async () => {
    // ── Step 1: A creates PBM game (White / Crown) ──────────────────────────
    await pageA.goto(BASE);
    await pageA.getByTestId('new-pbm-game').click();
    await pageA.getByTestId('creator-label').fill('Alice');
    await pageA.getByTestId('opponent-label').fill('Bob');
    await pageA.getByTestId('labels-next').click();
    await pageA.getByTestId('pick-white').click();
    await pageA.getByTestId('color-next').click();
    await pageA.getByTestId('privacy-ready').click();
    await pageA.getByRole('button', { name: 'The Crown', exact: true }).click();
    await pageA.getByTestId('create-game').click();

    // A sees ShareScreen with commit payload
    const commitUrl = await getShareUrl(pageA);
    expect(commitUrl).toContain('#g=');

    // Assert A has game in localStorage
    const aGames = await ctxA.storageState();
    const aLocal = aGames.origins.find(o => o.localStorage.some(e => e.name.startsWith('schism-game-')));
    expect(aLocal).toBeTruthy();

    // ── Step 2: B receives commit, responds (Black / Crown) ──────────────────
    await pageB.goto(commitUrl);
    await expect(pageB.getByTestId('import-input')).toBeVisible({ timeout: 8000 });
    // The hash was pre-loaded
    const existingB = await pageB.getByTestId('import-input').inputValue();
    if (!existingB.trim()) {
      await pageB.getByTestId('import-input').fill(commitUrl);
    }
    await pageB.getByTestId('import-submit').click();

    // B sees PBMRespondScreen
    await expect(pageB.getByTestId('respond-label')).toBeVisible({ timeout: 8000 });
    await pageB.getByTestId('respond-label').fill('Bob');
    await pageB.getByRole('button', { name: 'The Crown', exact: true }).click();
    await pageB.getByTestId('respond-submit').click();

    // B sees ShareScreen with respond (reveal) payload
    const respondUrl = await getShareUrl(pageB);
    expect(respondUrl).toContain('#g=');

    // Assert B has game stored
    const bGames = await ctxB.storageState();
    const bLocal = bGames.origins.find(o => o.localStorage.some(e => e.name.startsWith('schism-game-')));
    expect(bLocal).toBeTruthy();

    // ── Step 3: A receives respond, auto-reveals ─────────────────────────────
    await pageA.goto(respondUrl);
    await expect(pageA.getByTestId('import-input')).toBeVisible({ timeout: 8000 });
    const existingA = await pageA.getByTestId('import-input').inputValue();
    if (!existingA.trim()) {
      await pageA.getByTestId('import-input').fill(respondUrl);
    }
    await pageA.getByTestId('import-submit').click();

    // A auto-reveals and sees ShareScreen with play payload
    const playUrl = await getShareUrl(pageA);
    expect(playUrl).toContain('#g=');

    // ── Step 4: B imports play payload — sees board, White to move ───────────
    await pageB.goto(playUrl);
    await expect(pageB.getByTestId('import-input')).toBeVisible({ timeout: 8000 });
    const existingB2 = await pageB.getByTestId('import-input').inputValue();
    if (!existingB2.trim()) {
      await pageB.getByTestId('import-input').fill(playUrl);
    }
    await pageB.getByTestId('import-submit').click();
    // B sees the game — not B's turn (White to move, B is Black)
    await expect(pageB.getByTestId('waiting-banner')).toBeVisible({ timeout: 8000 });

    // ── Step 5: A goes back to game and makes move f3 (sq 13 → 21) ──────────
    // A is on ShareScreen — go back to game
    await pageA.getByTestId('back-to-game').click();
    await expect(pageA.getByText('White to move')).toBeVisible({ timeout: 5000 });
    await clickSq(pageA, 13); // f2
    await clickSq(pageA, 21); // f3
    // Share overlay auto-shows
    const moveUrl1 = await getShareUrl(pageA);

    // ── Step 6: B imports move 1, sees it's Black's turn, makes e6 ───────────
    await pageB.goto(moveUrl1);
    await expect(pageB.getByTestId('import-input')).toBeVisible({ timeout: 8000 });
    const bInput1 = await pageB.getByTestId('import-input').inputValue();
    if (!bInput1.trim()) {
      await pageB.getByTestId('import-input').fill(moveUrl1);
    }
    await pageB.getByTestId('import-submit').click();
    await expect(pageB.getByText('Black to move')).toBeVisible({ timeout: 5000 });
    // B is not in waiting mode — it's B's turn
    await expect(pageB.getByTestId('waiting-banner')).not.toBeVisible();
    await clickSq(pageB, 52); // e7
    await clickSq(pageB, 44); // e6
    const moveUrl2 = await getShareUrl(pageB);

    // ── Step 7: A imports move 2, makes g4 (sq 14 → 30) ────────────────────
    await pageA.goto(moveUrl2);
    await expect(pageA.getByTestId('import-input')).toBeVisible({ timeout: 8000 });
    const aInput2 = await pageA.getByTestId('import-input').inputValue();
    if (!aInput2.trim()) {
      await pageA.getByTestId('import-input').fill(moveUrl2);
    }
    await pageA.getByTestId('import-submit').click();
    await expect(pageA.getByText('White to move')).toBeVisible({ timeout: 5000 });
    await clickSq(pageA, 14); // g2
    await clickSq(pageA, 30); // g4
    const moveUrl3 = await getShareUrl(pageA);

    // ── Step 8: B imports move 3, makes Qh4# (sq 59 → 31) ──────────────────
    await pageB.goto(moveUrl3);
    await expect(pageB.getByTestId('import-input')).toBeVisible({ timeout: 8000 });
    const bInput3 = await pageB.getByTestId('import-input').inputValue();
    if (!bInput3.trim()) {
      await pageB.getByTestId('import-input').fill(moveUrl3);
    }
    await pageB.getByTestId('import-submit').click();
    await expect(pageB.getByText('Black to move')).toBeVisible({ timeout: 5000 });
    await clickSq(pageB, 59); // d8 (Queen)
    await clickSq(pageB, 31); // h4
    // Game over: Fool's Mate — Black wins
    const finalUrl = await getShareUrl(pageB);

    // ── Step 9: A imports final — sees result ────────────────────────────────
    await pageA.goto(finalUrl);
    await expect(pageA.getByTestId('import-input')).toBeVisible({ timeout: 8000 });
    const aInputFinal = await pageA.getByTestId('import-input').inputValue();
    if (!aInputFinal.trim()) {
      await pageA.getByTestId('import-input').fill(finalUrl);
    }
    await pageA.getByTestId('import-submit').click();
    // A sees the replay screen for the finished game
    await expect(pageA.getByTestId('replay-slider')).toBeVisible({ timeout: 8000 });

    // ── Assert both sides have consistent localStorage state ─────────────────
    const aFinal = await ctxA.storageState();
    const aEntry = aFinal.origins.flatMap(o => o.localStorage).find(e => e.name.startsWith('schism-game-'));
    expect(aEntry).toBeTruthy();
    if (aEntry) {
      const aPayload = JSON.parse(aEntry.value);
      expect(aPayload.phase).toBe('finished');
      expect(aPayload.result).toBe('0-1');
      expect(aPayload.moves).toHaveLength(4);
    }

    const bFinal = await ctxB.storageState();
    const bEntry = bFinal.origins.flatMap(o => o.localStorage).find(e => e.name.startsWith('schism-game-'));
    expect(bEntry).toBeTruthy();
    if (bEntry) {
      const bPayload = JSON.parse(bEntry.value);
      expect(bPayload.phase).toBe('finished');
      expect(bPayload.result).toBe('0-1');
    }
  });
});

// ─── Refresh resume ───────────────────────────────────────────────────────────

test.describe('Refresh resume', () => {
  test('local hotseat game survives refresh', async ({ page }) => {
    await page.goto(BASE);
    // Start a local game (Crown vs Crown)
    await page.getByRole('button', { name: 'New local game' }).click();
    await page.getByRole('button', { name: "I'm ready →" }).click();
    await page.getByRole('button', { name: 'The Crown', exact: true }).click();
    await page.getByRole('button', { name: 'Done →' }).click();
    await page.getByRole('button', { name: 'Player 2 is ready →' }).click();
    await page.getByRole('button', { name: "I'm ready →" }).click();
    await page.getByRole('button', { name: 'The Crown', exact: true }).click();
    await page.getByRole('button', { name: 'Done →' }).click();
    await page.getByTestId('start-game').click();

    // Make one move: e2-e4
    await page.click('[data-sq="12"]');
    await page.click('[data-sq="28"]');
    await expect(page.getByText('Black to move')).toBeVisible({ timeout: 3000 });

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Game should resume at current position (Black to move)
    await expect(page.getByText('Black to move')).toBeVisible({ timeout: 8000 });
  });

  test('PBM game refresh resumes on pbm-game screen', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // Create a play-phase PBM game manually in localStorage
    const gameId = 'refresh-test-game-id';
    const payload = {
      v: 1,
      gameId,
      phase: 'play',
      white: { label: 'Alice' },
      black: { label: 'Bob' },
      commit: { by: 'W', hash: '0'.repeat(64) },
      armies: { W: 'Crown', B: 'Crown' },
      reveal: { army: 'Crown', salt: '0'.repeat(32) },
      moves: [],
      result: null,
    };
    const meta = { myColor: 'W' };
    await ctx.addInitScript(({ id, p, m }) => {
      localStorage.setItem(`schism-game-${id}`, JSON.stringify(p));
      localStorage.setItem(`schism-meta-${id}`, JSON.stringify(m));
      sessionStorage.setItem('lastPBMGameId', id);
    }, { id: gameId, p: payload, m: meta });

    await page.goto(BASE);
    // Should auto-resume the PBM game
    await expect(page.getByText('White to move')).toBeVisible({ timeout: 8000 });
    // It's A's turn (White = myColor)
    await expect(page.getByTestId('waiting-banner')).not.toBeVisible();

    await ctx.close();
  });
});

// ─── Tampered URL ─────────────────────────────────────────────────────────────

test('tampered URL (mutated SAN) shows import error', async ({ page }) => {
  // Build a valid play-phase payload with one move, then corrupt the SAN
  const { createHash } = await import('node:crypto');
  const hasher = { sha256: async (s: string) => createHash('sha256').update(s).digest('hex') };

  const { createGame, respondToCommit, revealArmy, appendTurn, encodePayload } = await import('../../src/pbm/index');
  const { initialState, legalTurns } = await import('../../src/engine/index');

  const SALT = 'aa'.repeat(16);
  let payload = await createGame('Alice', 'W', 'Crown', SALT, hasher);
  payload = respondToCommit(payload, 'Bob', 'Crown');
  payload = await revealArmy(payload, 'Crown', SALT, hasher);

  // Get a legal first move
  const state = initialState('Crown', 'Crown');
  const turn = legalTurns(state)[0];
  payload = appendTurn(payload, turn);

  // Corrupt: replace the last SAN with garbage
  const tampered = {
    ...payload,
    moves: [...payload.moves.slice(0, -1), 'XXXILLEGAL'],
  };
  const encoded = encodePayload(tampered);
  const url = `http://localhost:5173${BASE}#g=${encoded}`;

  await page.goto(url);
  await expect(page.getByTestId('import-input')).toBeVisible({ timeout: 8000 });
  const existing = await page.getByTestId('import-input').inputValue();
  if (!existing.trim()) {
    await page.getByTestId('import-input').fill(url);
  }
  await page.getByTestId('import-submit').click();
  // Should show error (replay error or import-error screen)
  await expect(page.getByTestId('import-error')).toBeVisible({ timeout: 5000 });
});

// ─── Monotonic guard: stale earlier payload shows conflict screen ─────────────

test('importing stale payload for known game shows conflict screen', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Pre-populate: a game with 2 moves (degenerate local-style, no reveal so hash check is skipped)
  const { encodePayload } = await import('../../src/pbm/index');
  const gameId = 'conflict-test-id';
  const storedPayload = {
    v: 1,
    gameId,
    phase: 'play',
    white: { label: 'Alice' },
    black: { label: 'Bob' },
    commit: { by: 'W', hash: '0'.repeat(64) },
    armies: { W: 'Crown', B: 'Crown' },
    reveal: undefined,
    moves: ['e4', 'e5'],
    result: null,
  };
  const meta = { myColor: 'W' };
  await ctx.addInitScript(({ id, p, m }) => {
    localStorage.setItem(`schism-game-${id}`, JSON.stringify(p));
    localStorage.setItem(`schism-meta-${id}`, JSON.stringify(m));
  }, { id: gameId, p: storedPayload, m: meta });

  // Now import the same game with FEWER moves (stale); spread keeps reveal: undefined
  const stalePayload = { ...storedPayload, moves: ['e4'] };
  const encoded = encodePayload(stalePayload as Parameters<typeof encodePayload>[0]);
  const url = `http://localhost:5173${BASE}#g=${encoded}`;

  await page.goto(url);
  await expect(page.getByTestId('import-input')).toBeVisible({ timeout: 8000 });
  const existing = await page.getByTestId('import-input').inputValue();
  if (!existing.trim()) {
    await page.getByTestId('import-input').fill(url);
  }
  await page.getByTestId('import-submit').click();

  // Should show the conflict screen
  await expect(page.getByTestId('conflict-keep')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('conflict-discard')).toBeVisible();

  // Clicking "keep" should navigate away from conflict (not assert crash)
  await page.getByTestId('conflict-keep').click();

  await ctx.close();
});

// ─── Replay mode ─────────────────────────────────────────────────────────────

test('replay mode steps through a finished game', async ({ page }) => {
  const gameId = 'replay-test-id';
  const finishedPayload = {
    v: 1,
    gameId,
    phase: 'finished',
    white: { label: 'Alice' },
    black: { label: 'Bob' },
    commit: { by: 'W', hash: '0'.repeat(64) },
    armies: { W: 'Crown', B: 'Crown' },
    reveal: { army: 'Crown', salt: '0'.repeat(32) },
    // Fool's Mate: 1.f3 e6 2.g4 Qh4#
    moves: ['f3', 'e6', 'g4', 'Qh4#'],
    result: '0-1',
  };

  // Put payload directly in localStorage via addInitScript
  const meta = { myColor: 'W' };
  await page.addInitScript(({ id, p, m }) => {
    localStorage.setItem(`schism-game-${id}`, JSON.stringify(p));
    localStorage.setItem(`schism-meta-${id}`, JSON.stringify(m));
  }, { id: gameId, p: finishedPayload, m: meta });

  // Navigate to games list and open replay
  await page.goto(BASE);
  await page.getByTestId('games-list').click();
  await expect(page.getByTestId(`replay-${gameId}`)).toBeVisible({ timeout: 5000 });
  await page.getByTestId(`replay-${gameId}`).click();

  // Should see the replay controls
  await expect(page.getByTestId('replay-slider')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('replay-prev')).toBeVisible();
  await expect(page.getByTestId('replay-next')).toBeVisible();

  // Should start at final position (idx = 4)
  const slider = page.getByTestId('replay-slider');
  const value = await slider.inputValue();
  expect(Number(value)).toBe(4);

  // Step back to start
  await page.getByTestId('replay-prev').click();
  await page.getByTestId('replay-prev').click();
  await page.getByTestId('replay-prev').click();
  await page.getByTestId('replay-prev').click();
  const valueAfter = await slider.inputValue();
  expect(Number(valueAfter)).toBe(0);
});
