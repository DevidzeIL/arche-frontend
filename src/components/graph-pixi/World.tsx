import { createContext, useContext, useEffect, useRef } from 'react';
import Matter from 'matter-js';

interface WorldContextValue {
  engine: Matter.Engine;
  world: Matter.World;
}

const WorldContext = createContext<WorldContextValue | null>(null);

export function useWorld() {
  const context = useContext(WorldContext);
  if (!context) {
    throw new Error('useWorld must be used within WorldProvider');
  }
  return context;
}

interface WorldProviderProps {
  children: React.ReactNode;
}

export function WorldProvider({ children }: WorldProviderProps) {
  const engineRef = useRef<Matter.Engine | null>(null);

  useEffect(() => {
    // Create Matter Engine once
    const engine = Matter.Engine.create();
    
    // Match Josh Warren settings
    engine.world.gravity.y = 0; // No gravity
    engine.constraintIterations = 7; // Increased iterations for stability
    
    engineRef.current = engine;

    return () => {
      Matter.Engine.clear(engine);
    };
  }, []);

  if (!engineRef.current) {
    return null;
  }

  return (
    <WorldContext.Provider
      value={{
        engine: engineRef.current,
        world: engineRef.current.world,
      }}
    >
      {children}
    </WorldContext.Provider>
  );
}


