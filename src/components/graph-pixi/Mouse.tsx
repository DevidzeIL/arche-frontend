import { useEffect, useRef } from 'react';
import { useApplication } from '@pixi/react';
import Matter from 'matter-js';
import { useWorld } from './World';

export function Mouse() {
  const { app } = useApplication();
  const { engine, world } = useWorld();
  const mouseRef = useRef<Matter.Mouse | null>(null);
  const mouseConstraintRef = useRef<Matter.MouseConstraint | null>(null);

  useEffect(() => {
    // useApplication() returns { app: Application }
    const canvas = app.canvas as HTMLCanvasElement;
    if (!canvas) return;

    // Create Matter Mouse
    const mouse = Matter.Mouse.create(canvas);
    mouseRef.current = mouse;

    // Create MouseConstraint
    const mouseConstraint = Matter.MouseConstraint.create(engine, {
      mouse,
      constraint: {
        stiffness: 0.2,
        render: {
          visible: false,
        },
      },
    });

    // Scale mouse correctly for resolution
    const updateMouseScale = () => {
      if (mouse && app.renderer.resolution) {
        mouse.scale.x = 1 / app.renderer.resolution;
        mouse.scale.y = 1 / app.renderer.resolution;
      }
    };

    updateMouseScale();

    // Add constraint to world
    Matter.World.add(world, mouseConstraint);
    mouseConstraintRef.current = mouseConstraint;

    return () => {
      if (mouseConstraintRef.current) {
        Matter.World.remove(world, mouseConstraintRef.current);
      }
      mouseRef.current = null;
      mouseConstraintRef.current = null;
    };
  }, [app, engine, world]);

  return null;
}

