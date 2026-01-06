import { useEffect, useRef } from 'react';
import { useApplication } from '@pixi/react';
import Matter from 'matter-js';
import { useWorld } from './World';

const RESOLUTION = window.devicePixelRatio || 1;

export function Mouse() {
  const app = useApplication();
  const world = useWorld();
  const { engine, setSimMode } = world;
  const mouseConstraintRef = useRef<Matter.MouseConstraint | null>(null);
  const mouseRef = useRef<Matter.Mouse | null>(null);

  useEffect(() => {
    if (!app?.app || !engine) return;

    const pixiApp = app.app;
    
    // Функция инициализации MouseConstraint
    const initMouseConstraint = () => {
      // Проверяем, что renderer инициализирован
      if (!pixiApp.renderer || !pixiApp.canvas) return;

      const canvas = pixiApp.canvas as HTMLCanvasElement;
      if (!canvas) return;

      // Создаем Matter.Mouse (как в Josh Warren)
      const mouse = Matter.Mouse.create(canvas);
      
      // Устанавливаем scale для мыши (как в Josh Warren)
      const scale = RESOLUTION / Math.pow(RESOLUTION, 2);
      Matter.Mouse.setScale(mouse, { x: scale, y: scale });
      
      mouseRef.current = mouse;

      // Создаем MouseConstraint для перетаскивания
      const mouseConstraint = Matter.MouseConstraint.create(engine, {
        mouse: mouse,
        constraint: {
          stiffness: 0.2,
          render: {
            visible: false,
          },
        } as any,
      });

      mouseConstraintRef.current = mouseConstraint;

      // Добавляем constraint в мир
      Matter.World.add(engine.world, mouseConstraint);
      
      // События для переключения режимов симуляции
      Matter.Events.on(mouseConstraint, 'startdrag', () => {
        setSimMode('drag');
      });
      
      Matter.Events.on(mouseConstraint, 'enddrag', () => {
        setSimMode('settle');
      });
    };
    
    // Если renderer уже готов, инициализируем сразу
    if (pixiApp.renderer && pixiApp.canvas) {
      initMouseConstraint();
    } else {
      // Иначе ждём инициализации renderer
      let timeoutId: NodeJS.Timeout | null = null;
      const checkRenderer = () => {
        if (pixiApp.renderer && pixiApp.canvas) {
          initMouseConstraint();
        } else {
          timeoutId = setTimeout(checkRenderer, 50);
        }
      };
      checkRenderer();
      
      return () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (mouseConstraintRef.current) {
          Matter.World.remove(engine.world, mouseConstraintRef.current);
        }
        if (mouseRef.current) {
          Matter.Mouse.clearSourceEvents(mouseRef.current);
        }
      };
    }

    // Cleanup
    return () => {
      if (mouseConstraintRef.current) {
        Matter.World.remove(engine.world, mouseConstraintRef.current);
      }
      if (mouseRef.current) {
        Matter.Mouse.clearSourceEvents(mouseRef.current);
      }
    };
  }, [app, engine, setSimMode]);

  return null;
}

