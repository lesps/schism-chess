import { useCallback, useEffect, useRef, useState } from 'react';
import type { Army, Color, Turn } from '../engine/types';
import { parseSfen, serializeSfen } from '../engine';
import { replayGame } from '../engine/notation';
import { appendTurn, decodePayload, validatePayload } from '../pbm/index';
import type { PBMPayload, ValidationError } from '../pbm/types';
import { transport, checkMonotonicGuard, createLocalPayload, generateId } from '../app/transport';
import { browserHasher } from '../app/hasher';
import { revealArmy } from '../pbm/index';

import { HomeScreen } from './screens/HomeScreen';
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

type Screen =
  | { type: 'home' }
  | { type: 'new-game' }
  | { type: 'game'; gameId: string; armyW: Army; armyB: Army; initialSfen?: string }
  | { type: 'games-list' }
  | { type: 'pbm-create' }
  | { type: 'pbm-respond'; payload: PBMPayload }
  | { type: 'pbm-game'; gameId: string; myColor: Color; armyW: Army; armyB: Army; initialSfen?: string }
  | { type: 'import'; preloaded?: string }
  | { type: 'import-error'; error: ValidationError | string }
  | { type: 'conflict'; stored: PBMPayload; incoming: PBMPayload }
  | { type: 'salt-missing'; gameId: string; payload: PBMPayload }
  | { type: 'replay'; gameId: string }
  | { type: 'share'; payload: PBMPayload; title: string; subtitle?: string; onDone: () => void; onBackToGame?: () => void };

// Derive game screen from payload after update (for refresh-resume)
function buildPBMGameScreen(
  gameId: string,
  payload: PBMPayload,
  myColor: Color,
): Extract<Screen, { type: 'pbm-game' }> | null {
  const wArmy = payload.armies.W;
  const bArmy = payload.armies.B;
  if (!wArmy || !bArmy) return null;

  // Replay to get current state SFEN
  const movePairs: Array<{ white: string; black?: string }> = [];
  for (let i = 0; i < payload.moves.length; i += 2) {
    movePairs.push({ white: payload.moves[i], black: payload.moves[i + 1] });
  }
  const record = { armies: { W: wArmy as Army, B: bArmy as Army }, moves: movePairs };
  const result = replayGame(record);
  const initialSfen = ('moveNumber' in result)
    ? undefined
    : serializeSfen(result.finalState);

  return { type: 'pbm-game', gameId, myColor, armyW: wArmy as Army, armyB: bArmy as Army, initialSfen };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ type: 'home' });

  // Track the current payload for persistence (local and PBM games)
  const currentPayloadRef = useRef<PBMPayload | null>(null);
  // Share overlay for PBM games (shown on top of GameScreen)
  const [shareOverlay, setShareOverlay] = useState<{
    payload: PBMPayload; title: string; subtitle?: string;
    onBackToGame?: () => void;
  } | null>(null);

  // ── Hash-change routing (handles paste-URL-while-app-is-running) ─────────────
  useEffect(() => {
    function handleHashChange() {
      const hash = window.location.hash;
      if (hash.startsWith('#g=')) {
        setShareOverlay(null);
        setScreen({ type: 'import', preloaded: hash.slice(3) });
      }
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // ── Startup: initial URL routing + session resume ──────────────────────────
  useEffect(() => {
    const hash = window.location.hash;

    // DEV: ?sfen= loader
    if (import.meta.env.DEV) {
      const params = new URLSearchParams(window.location.search);
      const sfenParam = params.get('sfen');
      if (sfenParam) {
        try {
          const state = parseSfen(sfenParam);
          const gameId = generateId();
          setScreen({ type: 'game', gameId, armyW: state.armies.W, armyB: state.armies.B, initialSfen: sfenParam });
          return;
        } catch {
          console.warn('[dev] Invalid ?sfen= parameter — ignoring.');
        }
      }
    }

    // #g= link: go to import flow
    if (hash.startsWith('#g=')) {
      const encoded = hash.slice(3);
      setScreen({ type: 'import', preloaded: encoded });
      return;
    }

    // Session resume: try to restore last active game
    const lastLocalId = sessionStorage.getItem('lastLocalGameId');
    if (lastLocalId) {
      const payload = transport.loadGame(lastLocalId);
      if (payload && payload.phase !== 'finished' && payload.armies.W && payload.armies.B) {
        const meta = transport.loadMeta(lastLocalId);
        if (meta?.isLocal) {
          const movePairs: Array<{ white: string; black?: string }> = [];
          for (let i = 0; i < payload.moves.length; i += 2) {
            movePairs.push({ white: payload.moves[i], black: payload.moves[i + 1] });
          }
          const record = {
            armies: { W: payload.armies.W as Army, B: payload.armies.B as Army },
            moves: movePairs,
          };
          const replayResult = replayGame(record);
          const initialSfen = ('moveNumber' in replayResult)
            ? undefined
            : serializeSfen(replayResult.finalState);
          currentPayloadRef.current = payload;
          setScreen({
            type: 'game',
            gameId: lastLocalId,
            armyW: payload.armies.W as Army,
            armyB: payload.armies.B as Army,
            initialSfen,
          });
          return;
        }
      }
    }

    const lastPBMId = sessionStorage.getItem('lastPBMGameId');
    if (lastPBMId) {
      const payload = transport.loadGame(lastPBMId);
      const meta = transport.loadMeta(lastPBMId);
      if (payload && meta && !meta.isLocal && (payload.phase === 'play' || payload.phase === 'finished')) {
        const gameScreen = buildPBMGameScreen(lastPBMId, payload, meta.myColor);
        if (gameScreen) {
          currentPayloadRef.current = payload;
          setScreen(gameScreen);
          return;
        }
      }
    }
  }, []);

  // ── Turn submitted handler (used by both local and PBM games) ──────────────
  const handleTurnSubmitted = useCallback((turn: Turn) => {
    const prev = currentPayloadRef.current;
    if (!prev || prev.phase !== 'play') return;
    const newPayload = appendTurn(prev, turn);
    currentPayloadRef.current = newPayload;
    transport.saveGame(newPayload.gameId, newPayload);

    // PBM: show share overlay after each turn
    if (screen.type === 'pbm-game') {
      const { myColor, gameId, armyW, armyB } = screen;
      const isFinished = newPayload.phase === 'finished';
      const moveCount = newPayload.moves.length;
      const moveNum = Math.ceil(moveCount / 2);
      const title = isFinished ? 'Game over — share result' : `Share move ${moveNum}`;

      setShareOverlay({
        payload: newPayload,
        title,
        onBackToGame: isFinished ? undefined : () => {
          setShareOverlay(null);
          // Keep screen as pbm-game (GameScreen stays mounted, state preserved)
          void { myColor, gameId, armyW, armyB };
        },
      });
    }
  }, [screen]);

  // ── Import handler: decode, validate, route ────────────────────────────────
  async function handleImport(encoded: string) {
    // Decode
    const decoded = decodePayload(encoded);
    if ('error' in decoded) {
      setScreen({ type: 'import-error', error: decoded.error });
      return;
    }
    const incoming = decoded;

    // Validate
    const validation = await validatePayload(incoming, browserHasher);
    if (!validation.ok) {
      setScreen({ type: 'import-error', error: validation.error });
      return;
    }

    const gameId = incoming.gameId;
    const stored = transport.loadGame(gameId);
    const meta = transport.loadMeta(gameId);

    // Monotonic guard
    if (stored) {
      if (!checkMonotonicGuard(stored, incoming)) {
        setScreen({ type: 'conflict', stored, incoming });
        return;
      }
    }

    // Route by phase
    switch (incoming.phase) {
      case 'commit': {
        // Respondent receives the commit payload — go to respond flow
        // (only if we haven't already responded, i.e. no stored meta)
        if (meta) {
          // Already have this game — show it
          const gameScreen = buildPBMGameScreen(gameId, stored ?? incoming, meta.myColor);
          if (gameScreen) {
            currentPayloadRef.current = stored ?? incoming;
            setScreen(gameScreen);
          } else {
            setScreen({ type: 'games-list' });
          }
          return;
        }
        transport.saveGame(gameId, incoming);
        setScreen({ type: 'pbm-respond', payload: incoming });
        return;
      }

      case 'reveal': {
        // Committer receives the respond payload — auto-reveal
        if (!meta?.commit) {
          // Salt missing
          transport.saveGame(gameId, incoming);
          const opponentColor: Color = incoming.commit.by === 'W' ? 'B' : 'W';
          const opponentLabel = opponentColor === 'W'
            ? incoming.white.label
            : incoming.black.label;
          setScreen({ type: 'salt-missing', gameId, payload: incoming });
          void opponentLabel;
          return;
        }
        // Auto-reveal
        const { army, salt } = meta.commit;
        let playPayload: PBMPayload;
        try {
          playPayload = await revealArmy(incoming, army, salt, browserHasher);
        } catch {
          setScreen({ type: 'import-error', error: 'Hash mismatch during auto-reveal. Salt or army may be corrupted.' });
          return;
        }
        // Clear salt from meta now that reveal is done
        transport.saveMeta(gameId, { myColor: meta.myColor });
        transport.saveGame(gameId, playPayload);
        currentPayloadRef.current = playPayload;
        sessionStorage.setItem('lastPBMGameId', gameId);
        // Show share screen with play payload
        const wArmy = playPayload.armies.W as Army;
        const bArmy = playPayload.armies.B as Army;
        setScreen({
          type: 'share',
          payload: playPayload,
          title: 'Share to start the game',
          subtitle: `${wArmy} vs ${bArmy} — send this to your opponent`,
          onDone: () => {
            const gs = buildPBMGameScreen(gameId, playPayload, meta.myColor);
            if (gs) { currentPayloadRef.current = playPayload; setScreen(gs); }
            else setScreen({ type: 'games-list' });
          },
          onBackToGame: () => {
            const gs = buildPBMGameScreen(gameId, playPayload, meta.myColor);
            if (gs) { currentPayloadRef.current = playPayload; setScreen(gs); }
            else setScreen({ type: 'games-list' });
          },
        });
        return;
      }

      case 'play':
      case 'finished': {
        // Update stored payload
        transport.saveGame(gameId, incoming);

        if (!meta) {
          // Unknown game — we can't determine myColor; show games list
          setScreen({ type: 'games-list' });
          return;
        }

        if (incoming.phase === 'finished') {
          // Show replay/result
          currentPayloadRef.current = incoming;
          setScreen({ type: 'replay', gameId });
          return;
        }

        // Show pbm-game
        const gs = buildPBMGameScreen(gameId, incoming, meta.myColor);
        if (gs) {
          currentPayloadRef.current = incoming;
          sessionStorage.setItem('lastPBMGameId', gameId);
          setShareOverlay(null);
          setScreen(gs);
        } else {
          setScreen({ type: 'games-list' });
        }
        return;
      }
    }
  }

  // ── Local game start ────────────────────────────────────────────────────────
  function handleLocalStart(armyW: Army, armyB: Army) {
    const gameId = generateId();
    const payload = createLocalPayload(gameId, armyW, armyB);
    transport.saveGame(gameId, payload);
    transport.saveMeta(gameId, { myColor: 'W', isLocal: true });
    sessionStorage.setItem('lastLocalGameId', gameId);
    currentPayloadRef.current = payload;
    setScreen({ type: 'game', gameId, armyW, armyB });
  }

  function handleHome() {
    setScreen({ type: 'home' });
    setShareOverlay(null);
  }

  function handleNewGame() {
    setScreen({ type: 'home' });
    setShareOverlay(null);
  }

  function handleReviewFromModal() {
    const s = screen;
    if (s.type === 'game') setScreen({ type: 'replay', gameId: s.gameId });
    else if (s.type === 'pbm-game') setScreen({ type: 'replay', gameId: s.gameId });
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const s = screen;

  if (s.type === 'home') {
    return (
      <div className="app">
        <HomeScreen
          onNewLocalGame={() => setScreen({ type: 'new-game' })}
          onNewPBMGame={() => setScreen({ type: 'pbm-create' })}
          onGamesList={() => setScreen({ type: 'games-list' })}
          onImport={() => setScreen({ type: 'import' })}
        />
      </div>
    );
  }

  if (s.type === 'new-game') {
    return (
      <div className="app">
        <NewGameScreen
          onStart={handleLocalStart}
          onBack={() => setScreen({ type: 'home' })}
        />
      </div>
    );
  }

  if (s.type === 'game') {
    return (
      <div className="app">
        <GameScreen
          armyW={s.armyW}
          armyB={s.armyB}
          initialSfen={s.initialSfen}
          onTurnSubmitted={handleTurnSubmitted}
          onReview={handleReviewFromModal}
          onHome={handleHome}
          onNewGame={handleNewGame}
        />
      </div>
    );
  }

  if (s.type === 'pbm-game') {
    return (
      <div className="app">
        <GameScreen
          armyW={s.armyW}
          armyB={s.armyB}
          initialSfen={s.initialSfen}
          myColor={s.myColor}
          onTurnSubmitted={handleTurnSubmitted}
          onReview={handleReviewFromModal}
          onHome={handleHome}
          onNewGame={handleNewGame}
        />
        {shareOverlay && (
          <div className="share-overlay">
            <ShareScreen
              payload={shareOverlay.payload}
              title={shareOverlay.title}
              subtitle={shareOverlay.subtitle}
              onDone={() => {
                setShareOverlay(null);
                // If game finished, go to replay; otherwise stay on pbm-game
                if (currentPayloadRef.current?.phase === 'finished') {
                  setScreen({ type: 'replay', gameId: s.gameId });
                }
              }}
              onBackToGame={shareOverlay.onBackToGame}
            />
          </div>
        )}
      </div>
    );
  }

  if (s.type === 'games-list') {
    return (
      <div className="app">
        <GamesListScreen
          onBack={() => setScreen({ type: 'home' })}
          onResume={(gameId) => {
            const payload = transport.loadGame(gameId);
            const meta = transport.loadMeta(gameId);
            if (!payload || !meta) return;
            if (meta.isLocal) {
              const movePairs: Array<{ white: string; black?: string }> = [];
              for (let i = 0; i < payload.moves.length; i += 2) {
                movePairs.push({ white: payload.moves[i], black: payload.moves[i + 1] });
              }
              const record = {
                armies: { W: payload.armies.W as Army, B: payload.armies.B as Army },
                moves: movePairs,
              };
              const replayResult = replayGame(record);
              const initialSfen = ('moveNumber' in replayResult)
                ? undefined
                : serializeSfen(replayResult.finalState);
              currentPayloadRef.current = payload;
              sessionStorage.setItem('lastLocalGameId', gameId);
              setScreen({ type: 'game', gameId, armyW: payload.armies.W as Army, armyB: payload.armies.B as Army, initialSfen });
            } else {
              const gs = buildPBMGameScreen(gameId, payload, meta.myColor);
              if (gs) {
                currentPayloadRef.current = payload;
                sessionStorage.setItem('lastPBMGameId', gameId);
                setScreen(gs);
              }
            }
          }}
          onImport={() => setScreen({ type: 'import' })}
          onReplay={(gameId) => setScreen({ type: 'replay', gameId })}
        />
      </div>
    );
  }

  if (s.type === 'pbm-create') {
    return (
      <div className="app">
        <PBMCreateScreen
          onBack={() => setScreen({ type: 'home' })}
          onShare={(payload) => {
            currentPayloadRef.current = payload;
            setScreen({
              type: 'share',
              payload,
              title: 'Share your challenge',
              subtitle: 'Send this link to your opponent',
              onDone: () => setScreen({ type: 'games-list' }),
            });
          }}
        />
      </div>
    );
  }

  if (s.type === 'pbm-respond') {
    return (
      <div className="app">
        <PBMRespondScreen
          payload={s.payload}
          onBack={() => setScreen({ type: 'home' })}
          onShare={(responded) => {
            setScreen({
              type: 'share',
              payload: responded,
              title: 'Send your response',
              subtitle: 'Send this back to your opponent so they can reveal',
              onDone: () => setScreen({ type: 'games-list' }),
            });
          }}
        />
      </div>
    );
  }

  if (s.type === 'import') {
    return (
      <div className="app">
        <ImportScreen
          preloaded={s.preloaded}
          onBack={() => setScreen({ type: 'home' })}
          onImport={(encoded) => void handleImport(encoded)}
        />
      </div>
    );
  }

  if (s.type === 'import-error') {
    return (
      <div className="app">
        <div className="ng-screen" style={{ alignItems: 'center', gap: '24px' }}>
          <div className="conflict-icon" style={{ fontSize: '48px' }}>✗</div>
          <h2 className="conflict-title" style={{ textAlign: 'center' }}>Import failed</h2>
          <ImportErrorDisplay error={s.error} />
          <div className="ng-footer" style={{ flexDirection: 'column' }}>
            <button className="btn btn-secondary" onClick={() => setScreen({ type: 'import' })} data-testid="retry-import">
              Try again
            </button>
            <button className="btn btn-ghost" onClick={() => setScreen({ type: 'home' })}>
              Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (s.type === 'conflict') {
    return (
      <div className="app">
        <ConflictScreen
          stored={s.stored}
          incoming={s.incoming}
          onKeepStored={() => {
            const meta = transport.loadMeta(s.stored.gameId);
            if (meta) {
              const gs = buildPBMGameScreen(s.stored.gameId, s.stored, meta.myColor);
              if (gs) { currentPayloadRef.current = s.stored; setScreen(gs); return; }
            }
            setScreen({ type: 'games-list' });
          }}
          onDiscard={() => {
            transport.saveGame(s.incoming.gameId, s.incoming);
            const meta = transport.loadMeta(s.incoming.gameId);
            if (meta) {
              const gs = buildPBMGameScreen(s.incoming.gameId, s.incoming, meta.myColor);
              if (gs) { currentPayloadRef.current = s.incoming; setScreen(gs); return; }
            }
            setScreen({ type: 'games-list' });
          }}
        />
      </div>
    );
  }

  if (s.type === 'salt-missing') {
    const opponentColor: Color = s.payload.commit.by === 'W' ? 'B' : 'W';
    const opponentLabel = opponentColor === 'W'
      ? s.payload.white.label
      : s.payload.black.label;
    return (
      <div className="app">
        <SaltMissingScreen
          opponentLabel={opponentLabel || 'Opponent'}
          onForfeit={() => {
            transport.deleteGame(s.gameId);
            setScreen({ type: 'home' });
          }}
          onBack={() => setScreen({ type: 'home' })}
        />
      </div>
    );
  }

  if (s.type === 'replay') {
    const payload = transport.loadGame(s.gameId);
    if (!payload) {
      return (
        <div className="app">
          <div className="ng-screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'var(--text-muted)' }}>Game not found.</p>
            <button className="btn btn-ghost" onClick={() => setScreen({ type: 'games-list' })}>← Games</button>
          </div>
        </div>
      );
    }
    return (
      <div className="app">
        <ReplayScreen
          payload={payload}
          onBack={() => setScreen({ type: 'games-list' })}
        />
      </div>
    );
  }

  if (s.type === 'share') {
    return (
      <div className="app">
        <ShareScreen
          payload={s.payload}
          title={s.title}
          subtitle={s.subtitle}
          onDone={s.onDone}
          onBackToGame={s.onBackToGame}
        />
      </div>
    );
  }

  return null;
}
