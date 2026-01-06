import { useTick } from '@pixi/react';
import Matter from 'matter-js';
import { useWorld } from './World';

export function PhysicsLoop() {
  const { engine } = useWorld();

  useTick((ticker) => {
    // Match Josh Warren: Engine.update(engine, delta * (1000 / 60))
    // ticker.deltaTime is dimensionless scalar (~1.0 at 60fps)
    const deltaMs = ticker.deltaTime * (1000 / 60);
    Matter.Engine.update(engine, deltaMs);
  });

  return null;
}

