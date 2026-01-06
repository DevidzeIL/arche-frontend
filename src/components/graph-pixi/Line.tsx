import { useEffect, useRef } from 'react';
import { useTick } from '@pixi/react';
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { useCamera } from './Camera';

interface LineProps {
  sourceId: string;
  targetId: string;
  sourceBody: Matter.Body;
  targetBody: Matter.Body;
  isHighlighted: boolean;
  zoom: number;
  baseThickness: number;
  hoveredNodeId: string | null;
}

export function Line({
  sourceBody,
  targetBody,
  isHighlighted,
  zoom,
  baseThickness,
  hoveredNodeId,
}: LineProps) {
  const { camera } = useCamera();
  const graphicsRef = useRef<PIXI.Graphics | null>(null);
  const containerRef = useRef<PIXI.Container | null>(null);

  // Create container and graphics
  useEffect(() => {
    const container = new PIXI.Container();
    camera.addChild(container);
    containerRef.current = container;

    const graphics = new PIXI.Graphics();
    container.addChild(graphics);
    graphicsRef.current = graphics;

    return () => {
      if (containerRef.current) {
        camera.removeChild(containerRef.current);
        containerRef.current.destroy({ children: true });
      }
    };
  }, [camera]);

  // Update line position from Matter bodies every frame
  useTick(() => {
    if (!graphicsRef.current || !sourceBody || !targetBody) return;

    const g = graphicsRef.current;
    g.clear();

    // Thickness depends on zoom
    let thickness = baseThickness;
    if (zoom > 1) {
      thickness = baseThickness / zoom;
    } else {
      thickness = baseThickness * (1 / zoom) * 0.8;
    }

    // Color and opacity
    if (isHighlighted) {
      g.lineStyle(thickness * 1.6, 0x60a5fa, 0.85);
    } else {
      const opacity = zoom < 1 ? 0.28 : 0.18;
      g.lineStyle(thickness, 0x969696, opacity);
    }

    g.moveTo(sourceBody.position.x, sourceBody.position.y);
    g.lineTo(targetBody.position.x, targetBody.position.y);
  });

  // Alpha for fog of war
  useEffect(() => {
    if (!containerRef.current) return;

    let alpha = 1;
    if (hoveredNodeId && !isHighlighted) {
      alpha = 0.08;
    }
    containerRef.current.alpha = alpha;
  }, [hoveredNodeId, isHighlighted]);

  return null;
}
