import { useEffect, useState } from 'react';
import type { Army } from '../engine/types';
import { parseSfen } from '../engine';
import { HomeScreen } from './screens/HomeScreen';
import { NewGameScreen } from './screens/NewGameScreen';
import { GameScreen } from './screens/GameScreen';

type Screen =
  | { type: 'home' }
  | { type: 'new-game' }
  | { type: 'game'; armyW: Army; armyB: Army; initialSfen?: string };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ type: 'home' });

  // Dev-only: ?sfen= URL parameter loads a custom position directly into the game screen.
  // Gated by import.meta.env.DEV — never active in production builds.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const params = new URLSearchParams(window.location.search);
    const sfenParam = params.get('sfen');
    if (!sfenParam) return;
    try {
      const state = parseSfen(sfenParam);
      setScreen({
        type: 'game',
        armyW: state.armies.W,
        armyB: state.armies.B,
        initialSfen: sfenParam,
      });
    } catch {
      console.warn('[dev] Invalid ?sfen= parameter — ignoring.');
    }
  }, []);

  function handleStart(armyW: Army, armyB: Army) {
    setScreen({ type: 'game', armyW, armyB });
  }

  function handleNewGame() {
    setScreen({ type: 'home' });
  }

  return (
    <div className="app">
      {screen.type === 'home' && (
        <HomeScreen onNewGame={() => setScreen({ type: 'new-game' })} />
      )}
      {screen.type === 'new-game' && (
        <NewGameScreen
          onStart={handleStart}
          onBack={() => setScreen({ type: 'home' })}
        />
      )}
      {screen.type === 'game' && (
        <GameScreen
          armyW={screen.armyW}
          armyB={screen.armyB}
          initialSfen={screen.initialSfen}
          onHome={() => setScreen({ type: 'home' })}
          onNewGame={handleNewGame}
        />
      )}
    </div>
  );
}
