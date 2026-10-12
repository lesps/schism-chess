import { useCallback, useEffect, useRef, useState } from 'react';
import type { Army, Color, Turn } from '../engine/types';
import { parseSfen } from '../engine';
import { appendTurn, decodePayload, revealArmy, validatePayload } from '../pbm/index';
import type { PBMPayload, ValidationError } from '../pbm/types';
import {
  transport,
  checkMonotonicGuard,
  createLocalPayload,
  generateId,
  isOlderPhase,
  persistGame,
} from '../app/transport';
import type { LocalGameMeta } from '../app/transport';
import { browserHasher } from '../app/hasher';

import { HomeScreen } from './screens/HomeScreen';
import type { ContinueInfo } from './screens/HomeScreen';
import { NewGameScreen } from './screens/NewGameScreen';
import { GameScreen } from './screens/GameScreen';
import { GamesListScreen } from './screens/GamesListScreen';
import { PBMCreateScreen } from './screens/PBMCreateScreen';
import { PBMRespondScreen } from './screens/PBMRespondScreen';
import { ImportScreen, ImportErrorDisplay } from './screens/ImportScreen';
import { ShareScreen } from './screens/ShareScreen';
import { ConflictScreen } from './screens/ConflictScreen';
import { SaltMissingScreen } from './screens/SaltMissingScreen';
import { ReplayScreen } from './screens/ReplayScreen';
import { RulesScreen } from './screens/RulesScreen';

interface GameScreenState {
  type: 'game';
  gameId: string;
  armyW: Army;
  armyB: Army;
  /** SAN list to rebuild the game from (empty for a fresh game). */
  moves: readonly string[];
  /** DEV `?sfen=` loader only. */
  initialSfen?: string;
  /** PBM: the local player's color. Absent for hotseat. */
  myColor?: Color;
  opponentLabel?: string;
}

interface ShareState {
  payload: PBMPayload;
  title: string;
  subtitle?: string;
  /** Text sent along with the link, addressed to the recipient. */
  message?: string;
  onDone: () => void;
  onBackToGame?: () => void;
}

type Screen =
  | { type: 'home' }
  | { type: 'new-game' }
  | GameScreenState
  | { type: 'games-list' }
  | { type: 'pbm-create' }
  | { type: 'pbm-respond'; payload: PBMPayload }
  | { type: 'loading' }
  | { type: 'import'; preloaded?: string }
  | { type: 'import-error'; error: ValidationError | string; raw?: string }
  | { type: 'conflict'; stored: PBMPayload; incoming: PBMPayload }
  | { type: 'salt-missing'; gameId: string; payload: PBMPayload }
  | { type: 'replay'; gameId: string }
  | ({ type: 'share' } & ShareState);

const CHALLENGE_MESSAGE = "I challenge you! My army is sealed — open this to pick yours:";
const RESPONSE_MESSAGE = "I've picked my army — open this to reveal yours and start the game:";

const LAST_GAME_KEY = 'lastGameId';
// Pre-1.3 sessions stored these; still honoured so an upgrade resumes cleanly.
const LEGACY_LAST_GAME_KEYS = ['lastLocalGameId', 'lastPBMGameId'];

function sessionGet(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function sessionSet(key: string, value: string): void {
  try { sessionStorage.setItem(key, value); } catch { /* resume just won't work */ }
}

/** Drop a consumed `#g=` / `#rules` fragment so a refresh doesn't replay it. */
function consumeHash(): void {
  if (!window.location.hash) return;
  history.replaceState(history.state, '', window.location.pathname + window.location.search);
}

function rulesAnchorFromHash(hash: string): string | undefined {
  return hash.slice('#rules'.length).replace(/^\//, '') || undefined;
}

function opponentLabelOf(payload: PBMPayload, myColor: Color): string {
  return (myColor === 'W' ? payload.black.label : payload.white.label) || 'your opponent';
}

/** The most recently touched unfinished game, for the Home screen's Continue button. */
function findContinueGame(): ContinueInfo | null {
  let best: { id: string; payload: PBMPayload; meta: LocalGameMeta } | null = null;
  for (const { id, payload } of transport.listGames()) {
    if (payload.phase !== 'play') continue;
    const meta = transport.loadMeta(id);
    if (!meta || !payload.armies.W || !payload.armies.B) continue;
    if (!best || (meta.updatedAt ?? 0) > (best.meta.updatedAt ?? 0)) best = { id, payload, meta };
  }
  if (!best) return null;
  const { id, payload, meta } = best;
  const toMove: Color = payload.moves.length % 2 === 0 ? 'W' : 'B';
  const detail = meta.isLocal
    ? `${toMove === 'W' ? 'White' : 'Black'} to move · move ${Math.floor(payload.moves.length / 2) + 1}`
    : toMove === meta.myColor
      ? `Your move vs ${opponentLabelOf(payload, meta.myColor)}`
      : `Waiting on ${opponentLabelOf(payload, meta.myColor)}`;
  return { gameId: id, armyW: payload.armies.W!, armyB: payload.armies.B!, detail, isLocal: !!meta.isLocal };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ type: 'home' });
  const screenRef = useRef(screen);
  screenRef.current = screen;

  // The payload behind the current game screen (local and PBM games alike)
  const currentPayloadRef = useRef<PBMPayload | null>(null);
  // Bumped to force a fresh GameScreen even for the same game id (rematch, re-open)
  const [gameNonce, setGameNonce] = useState(0);
  // Rules overlay (shown on top of any screen without unmounting it)
  const [rules, setRules] = useState<{ anchor?: string } | null>(null);
  const rulesRef = useRef(rules);
  rulesRef.current = rules;
  // Share overlay for PBM games (shown on top of GameScreen)
  const [shareOverlay, setShareOverlay] = useState<ShareState | null>(null);
  const shareOverlayRef = useRef(shareOverlay);
  shareOverlayRef.current = shareOverlay;

  // ── Browser back button ──────────────────────────────────────────────────────
  // One history entry stands for "away from home" and one for an open overlay, so
  // Android/browser Back closes the overlay, then returns home, then leaves.
  const screenEntryRef = useRef(false);
  const overlayEntryRef = useRef(false);
  const ignorePopsRef = useRef(0);

  const pushEntry = useCallback((kind: 'screen' | 'overlay') => {
    history.pushState({ schism: kind }, '', window.location.pathname + window.location.search);
  }, []);

  const popOwnEntry = useCallback(() => {
    ignorePopsRef.current++;
    history.back();
  }, []);

  const openRules = useCallback((anchor?: string) => {
    if (!overlayEntryRef.current) {
      pushEntry('overlay');
      overlayEntryRef.current = true;
    }
    setRules({ anchor: anchor || undefined });
  }, [pushEntry]);

  const closeRules = useCallback(() => {
    setRules(null);
    if (overlayEntryRef.current) {
      overlayEntryRef.current = false;
      popOwnEntry();
    }
  }, [popOwnEntry]);

  useEffect(() => {
    if (screen.type !== 'home' && !screenEntryRef.current) {
      // After a reload we may already stand on our own entry (history.state survives
      // reloads): adopt it rather than stacking another.
      if ((history.state as { schism?: string } | null)?.schism !== 'screen') pushEntry('screen');
      screenEntryRef.current = true;
    } else if (screen.type === 'home' && screenEntryRef.current && !overlayEntryRef.current) {
      screenEntryRef.current = false;
      popOwnEntry();
    }
  }, [screen.type, pushEntry, popOwnEntry]);

  useEffect(() => {
    function onPopState() {
      if (ignorePopsRef.current > 0) { ignorePopsRef.current--; return; }
      if (window.location.hash.startsWith('#g=')) return; // a pasted link: hashchange routes it
      if (rulesRef.current) {
        overlayEntryRef.current = false;
        setRules(null);
        return;
      }
      screenEntryRef.current = false;
      if (shareOverlayRef.current) setShareOverlay(null);
      if (screenRef.current.type !== 'home') setScreen({ type: 'home' });
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // ── Routing a stored game by its phase ──────────────────────────────────────

  const showGame = useCallback((gameId: string, payload: PBMPayload, meta: LocalGameMeta) => {
    const armyW = payload.armies.W, armyB = payload.armies.B;
    if (!armyW || !armyB) { setScreen({ type: 'games-list' }); return; }
    currentPayloadRef.current = payload;
    sessionSet(LAST_GAME_KEY, gameId);
    setShareOverlay(null);
    setGameNonce(n => n + 1);
    setScreen({
      type: 'game',
      gameId,
      armyW,
      armyB,
      moves: payload.moves,
      myColor: meta.isLocal ? undefined : meta.myColor,
      opponentLabel: meta.isLocal ? undefined : opponentLabelOf(payload, meta.myColor),
    });
  }, []);

  const autoReveal = useCallback(async (payload: PBMPayload, meta: LocalGameMeta) => {
    if (!meta.commit) return;
    const gameId = payload.gameId;
    let playPayload: PBMPayload;
    try {
      playPayload = await revealArmy(payload, meta.commit.army, meta.commit.salt, browserHasher);
    } catch {
      setScreen({ type: 'import-error', error: 'Hash mismatch during auto-reveal. Salt or army may be corrupted.' });
      return;
    }
    // Clear the salt now that the reveal is public
    persistGame(gameId, playPayload, { myColor: meta.myColor, commit: undefined });
    const playMeta: LocalGameMeta = { myColor: meta.myColor };
    const goToGame = () => showGame(gameId, playPayload, playMeta);
    setScreen({
      type: 'share',
      payload: playPayload,
      title: 'Share to start the game',
      subtitle: `${playPayload.armies.W} vs ${playPayload.armies.B} — send this to your opponent`,
      message: `Armies revealed: ${playPayload.armies.W} vs ${playPayload.armies.B}. Open to see the board:`,
      onDone: goToGame,
      onBackToGame: goToGame,
    });
  }, [showGame]);

  /** Open whatever a stored game needs next: share, respond, reveal, play, or watch. */
  const openGame = useCallback((gameId: string) => {
    const payload = transport.loadGame(gameId);
    const meta = transport.loadMeta(gameId);
    if (!payload) { setScreen({ type: 'games-list' }); return; }

    switch (payload.phase) {
      case 'commit':
        if (meta?.commit) {
          setScreen({
            type: 'share',
            payload,
            title: 'Share your challenge',
            subtitle: 'Send this link to your opponent',
            message: CHALLENGE_MESSAGE,
            onDone: () => setScreen({ type: 'games-list' }),
          });
        } else {
          setScreen({ type: 'pbm-respond', payload });
        }
        return;
      case 'reveal':
        if (meta && meta.myColor !== payload.commit.by) {
          // We responded; the challenger hasn't revealed yet. Offer our link again.
          setScreen({
            type: 'share',
            payload,
            title: 'Send your response',
            subtitle: 'Send this back to your opponent so they can reveal',
            message: RESPONSE_MESSAGE,
            onDone: () => setScreen({ type: 'games-list' }),
          });
        } else if (meta?.commit) {
          void autoReveal(payload, meta);
        } else {
          setScreen({ type: 'salt-missing', gameId, payload });
        }
        return;
      case 'play':
      case 'finished':
        if (!meta) { setScreen({ type: 'replay', gameId }); return; } // a game we only watch
        showGame(gameId, payload, meta);
        return;
    }
  }, [autoReveal, showGame]);

  // ── Import handler: decode, validate, route ────────────────────────────────
  const handleImport = useCallback(async (encoded: string) => {
    setShareOverlay(null);
    setScreen({ type: 'loading' });

    const decoded = decodePayload(encoded);
    if ('error' in decoded) {
      setScreen({ type: 'import-error', error: decoded.error, raw: encoded });
      return;
    }
    const incoming = decoded;
    const validation = await validatePayload(incoming, browserHasher);
    if (!validation.ok) {
      setScreen({ type: 'import-error', error: validation.error, raw: encoded });
      return;
    }

    const gameId = incoming.gameId;
    const stored = transport.loadGame(gameId);
    const meta = transport.loadMeta(gameId);

    if (stored) {
      // An old link for a game that has moved on (e.g. the original challenge):
      // keep what we have and show it.
      if (isOlderPhase(stored, incoming)) { openGame(gameId); return; }
      if (!checkMonotonicGuard(stored, incoming)) {
        setScreen({ type: 'conflict', stored, incoming });
        return;
      }
    }

    switch (incoming.phase) {
      case 'commit':
        if (!meta) transport.saveGame(gameId, incoming); // respondent: no meta until they answer
        openGame(gameId);
        return;
      case 'reveal':
        if (meta) persistGame(gameId, incoming);
        else transport.saveGame(gameId, incoming);
        openGame(gameId);
        return;
      case 'play':
      case 'finished':
        if (meta) persistGame(gameId, incoming);
        else transport.saveGame(gameId, incoming); // spectator copy
        if (incoming.phase === 'finished' || !meta) {
          currentPayloadRef.current = incoming;
          setScreen({ type: 'replay', gameId });
          return;
        }
        openGame(gameId);
        return;
    }
  }, [openGame]);

  // ── Hash-change routing (handles paste-URL-while-app-is-running) ─────────────
  useEffect(() => {
    function handleHashChange() {
      const hash = window.location.hash;
      if (hash.startsWith('#g=')) {
        consumeHash();
        setRules(null);
        void handleImport(hash.slice(3));
      } else if (hash.startsWith('#rules')) {
        consumeHash();
        openRules(rulesAnchorFromHash(hash));
      }
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [handleImport, openRules]);

  // ── Startup: initial URL routing + session resume ──────────────────────────
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return; // StrictMode re-runs effects; route once
    startedRef.current = true;
    const hash = window.location.hash;

    // DEV: ?sfen= loader
    if (import.meta.env.DEV) {
      const sfenParam = new URLSearchParams(window.location.search).get('sfen');
      if (sfenParam) {
        try {
          const state = parseSfen(sfenParam);
          setScreen({
            type: 'game', gameId: generateId(), armyW: state.armies.W, armyB: state.armies.B,
            moves: [], initialSfen: sfenParam,
          });
          return;
        } catch {
          console.warn('[dev] Invalid ?sfen= parameter — ignoring.');
        }
      }
    }

    if (hash.startsWith('#rules')) {
      consumeHash();
      openRules(rulesAnchorFromHash(hash));
      return;
    }

    if (hash.startsWith('#g=')) {
      consumeHash();
      void handleImport(hash.slice(3));
      return;
    }

    // Session resume: reopen the last game this tab was playing
    for (const key of [LAST_GAME_KEY, ...LEGACY_LAST_GAME_KEYS]) {
      const id = sessionGet(key);
      if (!id) continue;
      const payload = transport.loadGame(id);
      const meta = transport.loadMeta(id);
      if (!payload || !meta) continue;
      const resumable = payload.phase === 'play' || (payload.phase === 'finished' && !meta.isLocal);
      if (!resumable) continue;
      showGame(id, payload, meta);
      return;
    }
  }, [handleImport, openRules, showGame]);

  // ── Game callbacks ─────────────────────────────────────────────────────────
  const handleTurnSubmitted = useCallback((turn: Turn) => {
    const prev = currentPayloadRef.current;
    const s = screenRef.current;
    if (!prev || prev.phase !== 'play' || s.type !== 'game') return;
    let next: PBMPayload;
    try {
      next = appendTurn(prev, turn);
    } catch (err) {
      console.error('[schism] could not record turn', err);
      return;
    }
    currentPayloadRef.current = next;
    persistGame(next.gameId, next);

    // PBM: share the move straight away
    if (s.myColor !== undefined) {
      const isFinished = next.phase === 'finished';
      const moveNum = Math.ceil(next.moves.length / 2);
      setShareOverlay({
        payload: next,
        title: isFinished ? 'Game over — share result' : `Share move ${moveNum}`,
        subtitle: isFinished ? undefined : `Send this link to ${s.opponentLabel ?? 'your opponent'}`,
        message: isFinished ? 'Game over — open to see how it ended:' : `My move ${moveNum} (${next.moves[next.moves.length - 1]}) — your turn:`,
        onDone: () => setShareOverlay(null),
        onBackToGame: isFinished ? undefined : () => setShareOverlay(null),
      });
    }
  }, []);

  const handleUndo = useCallback(() => {
    const prev = currentPayloadRef.current;
    if (!prev || prev.moves.length === 0) return;
    const next: PBMPayload = { ...prev, moves: prev.moves.slice(0, -1), phase: 'play', result: null };
    currentPayloadRef.current = next;
    persistGame(next.gameId, next);
  }, []);

  const handleShareAgain = useCallback(() => {
    const payload = currentPayloadRef.current;
    const s = screenRef.current;
    if (!payload || s.type !== 'game') return;
    setShareOverlay({
      payload,
      title: payload.phase === 'finished' ? 'Share the result' : `Share move ${Math.ceil(payload.moves.length / 2)}`,
      subtitle: `Send this link to ${s.opponentLabel ?? 'your opponent'}`,
      message: payload.phase === 'finished'
        ? 'Game over — open to see how it ended:'
        : `My move ${Math.ceil(payload.moves.length / 2)} (${payload.moves[payload.moves.length - 1] ?? '—'}) — your turn:`,
      onDone: () => setShareOverlay(null),
      onBackToGame: () => setShareOverlay(null),
    });
  }, []);

  function handleLocalStart(armyW: Army, armyB: Army) {
    const gameId = generateId();
    const payload = createLocalPayload(gameId, armyW, armyB);
    persistGame(gameId, payload, { myColor: 'W', isLocal: true });
    showGame(gameId, payload, { myColor: 'W', isLocal: true });
  }

  function goHome() {
    setShareOverlay(null);
    setScreen({ type: 'home' });
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const overlayOpen = rules !== null || shareOverlay !== null;

  function renderScreen() {
    const s = screen;
    switch (s.type) {
      case 'home':
        return (
          <HomeScreen
            continueGame={findContinueGame()}
            onContinue={openGame}
            onNewLocalGame={() => setScreen({ type: 'new-game' })}
            onNewPBMGame={() => setScreen({ type: 'pbm-create' })}
            onGamesList={() => setScreen({ type: 'games-list' })}
            onImport={() => setScreen({ type: 'import' })}
            onRules={() => openRules()}
          />
        );

      case 'new-game':
        return (
          <NewGameScreen
            onStart={handleLocalStart}
            onBack={goHome}
            onRules={anchor => openRules(anchor)}
          />
        );

      case 'game': {
        const isLocal = s.myColor === undefined;
        return (
          <GameScreen
            key={`${s.gameId}:${gameNonce}`}
            armyW={s.armyW}
            armyB={s.armyB}
            initialMoves={s.moves}
            initialSfen={s.initialSfen}
            myColor={s.myColor}
            opponentLabel={s.opponentLabel}
            active={!overlayOpen}
            onTurnSubmitted={handleTurnSubmitted}
            onUndo={isLocal ? handleUndo : undefined}
            onShare={isLocal ? undefined : handleShareAgain}
            onReview={() => setScreen({ type: 'replay', gameId: s.gameId })}
            onRematch={isLocal ? () => handleLocalStart(s.armyW, s.armyB) : undefined}
            onHome={goHome}
            onNewGame={isLocal ? () => setScreen({ type: 'new-game' }) : goHome}
            onRules={anchor => openRules(anchor)}
          />
        );
      }

      case 'games-list':
        return (
          <GamesListScreen
            onBack={goHome}
            onOpen={openGame}
            onImport={() => setScreen({ type: 'import' })}
            onReplay={(gameId) => setScreen({ type: 'replay', gameId })}
          />
        );

      case 'pbm-create':
        return (
          <PBMCreateScreen
            onBack={goHome}
            onRules={anchor => openRules(anchor)}
            onShare={(payload) => {
              setScreen({
                type: 'share',
                payload,
                title: 'Share your challenge',
                subtitle: 'Send this link to your opponent',
                message: CHALLENGE_MESSAGE,
                onDone: () => setScreen({ type: 'games-list' }),
              });
            }}
          />
        );

      case 'pbm-respond':
        return (
          <PBMRespondScreen
            payload={s.payload}
            onBack={goHome}
            onRules={anchor => openRules(anchor)}
            onShare={(responded) => {
              setScreen({
                type: 'share',
                payload: responded,
                title: 'Send your response',
                subtitle: 'Send this back to your opponent so they can reveal',
                message: RESPONSE_MESSAGE,
                onDone: () => setScreen({ type: 'games-list' }),
              });
            }}
          />
        );

      case 'loading':
        return (
          <div className="ng-screen loading-screen" aria-busy="true">
            <div className="loading-spinner" aria-hidden />
            <p className="loading-text">Opening game…</p>
          </div>
        );

      case 'import':
        return (
          <ImportScreen
            preloaded={s.preloaded}
            onBack={goHome}
            onImport={(encoded) => void handleImport(encoded)}
          />
        );

      case 'import-error':
        return (
          <div className="ng-screen" style={{ alignItems: 'center', gap: '24px' }}>
            <div className="conflict-icon" style={{ fontSize: '48px' }}>✗</div>
            <h2 className="conflict-title" style={{ textAlign: 'center' }}>Import failed</h2>
            <ImportErrorDisplay error={s.error} />
            <div className="ng-footer" style={{ flexDirection: 'column', width: '100%', maxWidth: 360 }}>
              <button className="btn btn-secondary" onClick={() => setScreen({ type: 'import', preloaded: s.raw })} data-testid="retry-import">
                Try again
              </button>
              <button className="btn btn-ghost" onClick={goHome}>
                Home
              </button>
            </div>
          </div>
        );

      case 'conflict':
        return (
          <ConflictScreen
            stored={s.stored}
            incoming={s.incoming}
            onKeepStored={() => openGame(s.stored.gameId)}
            onDiscard={() => {
              if (transport.loadMeta(s.incoming.gameId)) persistGame(s.incoming.gameId, s.incoming);
              else transport.saveGame(s.incoming.gameId, s.incoming);
              openGame(s.incoming.gameId);
            }}
          />
        );

      case 'salt-missing': {
        const opponentColor: Color = s.payload.commit.by === 'W' ? 'B' : 'W';
        const opponentLabel = opponentColor === 'W' ? s.payload.white.label : s.payload.black.label;
        return (
          <SaltMissingScreen
            opponentLabel={opponentLabel || 'Opponent'}
            onForfeit={() => {
              transport.deleteGame(s.gameId);
              goHome();
            }}
            onBack={goHome}
          />
        );
      }

      case 'replay': {
        const payload = transport.loadGame(s.gameId);
        if (!payload) {
          return (
            <div className="ng-screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'var(--text-dim)' }}>Game not found.</p>
              <button className="btn btn-ghost" onClick={() => setScreen({ type: 'games-list' })}>← Games</button>
            </div>
          );
        }
        return (
          <ReplayScreen
            payload={payload}
            onBack={() => setScreen({ type: 'games-list' })}
          />
        );
      }

      case 'share':
        return (
          <ShareScreen
            payload={s.payload}
            title={s.title}
            subtitle={s.subtitle}
            message={s.message}
            onDone={s.onDone}
            onBackToGame={s.onBackToGame}
          />
        );
    }
  }

  return (
    <div className="app">
      <div
        className="screen-layer"
        aria-hidden={overlayOpen || undefined}
        {...(overlayOpen ? { inert: '' } : {})}
      >
        {renderScreen()}
      </div>

      {shareOverlay && rules === null && (
        <div className="share-overlay">
          <ShareScreen
            payload={shareOverlay.payload}
            title={shareOverlay.title}
            subtitle={shareOverlay.subtitle}
            message={shareOverlay.message}
            onDone={() => {
              const done = shareOverlay.onDone;
              done();
              if (currentPayloadRef.current?.phase === 'finished' && screen.type === 'game') {
                setScreen({ type: 'replay', gameId: screen.gameId });
              }
            }}
            onBackToGame={shareOverlay.onBackToGame}
          />
        </div>
      )}

      {rules !== null && (
        <div className="rules-overlay">
          <RulesScreen anchor={rules.anchor} onBack={closeRules} />
        </div>
      )}
    </div>
  );
}
