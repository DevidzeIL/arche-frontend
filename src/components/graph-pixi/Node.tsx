import { useEffect, useRef } from 'react';
import { useTick } from '@pixi/react';
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { useWorld } from './World';
import { useCamera } from './Camera';
import { GraphNode } from './buildGraphData';
import { getNodeColor, getNodeRadius } from './buildGraphData';

interface NodeProps {
  node: GraphNode;
  graphSettings: {
    nodeColors: Record<string, string>;
    nodeSizeBy: 'fixed' | 'links';
    nodeSize: number;
    textFadeThreshold: number;
  };
  hoveredNodeId: string | null;
  selectedNodeId: string | null;
  highlightNodes: Set<string>;
}

export function Node({
  node,
  graphSettings,
  hoveredNodeId,
  selectedNodeId,
  highlightNodes,
}: NodeProps) {
  const { world } = useWorld();
  const { camera, zoom } = useCamera();
  const bodyRef = useRef<Matter.Body | null>(null);
  const graphicsRef = useRef<PIXI.Graphics | null>(null);
  const textRef = useRef<PIXI.Text | null>(null);
  const textBgRef = useRef<PIXI.Graphics | null>(null);
  const containerRef = useRef<PIXI.Container | null>(null);

  const fullSettings = {
    ...graphSettings,
    linkDistance: 100,
    linkForce: 0.5,
    repelForce: -100,
  };
  const radius = getNodeRadius(node, fullSettings);
  const color = getNodeColor(node.type, graphSettings.nodeColors);
  const colorInt = parseInt(color.replace('#', ''), 16);

  const isHovered = node.id === hoveredNodeId;
  const isSelected = node.id === selectedNodeId;
  const isNeighbor = highlightNodes.has(node.id) && !isHovered;

  // Create Matter body on mount
  useEffect(() => {
    // Random initial position
    const x = (Math.random() - 0.5) * 3000;
    const y = (Math.random() - 0.5) * 3000;

    const body = Matter.Bodies.circle(x, y, radius, {
      frictionAir: 0.12,
      restitution: 0.3,
      density: 0.001,
      inertia: Infinity,
    });

    (body as any).nodeId = node.id;
    Matter.World.add(world, body);
    bodyRef.current = body;

    // Create Pixi container
    const container = new PIXI.Container();
    camera.addChild(container);
    containerRef.current = container;

    // Create graphics for node
    const graphics = new PIXI.Graphics();
    container.addChild(graphics);
    graphicsRef.current = graphics;

    return () => {
      if (bodyRef.current) {
        Matter.World.remove(world, bodyRef.current);
      }
      if (containerRef.current) {
        camera.removeChild(containerRef.current);
        containerRef.current.destroy({ children: true });
      }
    };
  }, [world, camera, node.id, radius]);

  // Update Pixi position from Matter body every frame
  useTick(() => {
    if (!bodyRef.current || !containerRef.current) return;

    const body = bodyRef.current;
    containerRef.current.x = body.position.x;
    containerRef.current.y = body.position.y;
  });

  // Render node graphics
  useEffect(() => {
    if (!graphicsRef.current) return;

    const g = graphicsRef.current;
    g.clear();

    // Visual scale for hover/neighbor
    let visualScale = 1;
    if (isHovered) {
      visualScale = 1.2;
    } else if (isNeighbor) {
      visualScale = 1.1;
    }
    const visualRadius = radius * visualScale;

    // Glow for hovered
    if (isHovered) {
      const glowRadius = visualRadius + 8;
      g.beginFill(0xadd8e6, 0.08);
      g.drawCircle(0, 0, glowRadius);
      g.endFill();
      g.beginFill(0xadd8e6, 0.12);
      g.drawCircle(0, 0, visualRadius + 5);
      g.endFill();
      g.beginFill(0xffffff, 0.15);
      g.drawCircle(0, 0, visualRadius + 2);
      g.endFill();
    }

    // Glow for selected
    if (isSelected && !isHovered) {
      const glowRadius = visualRadius + 6;
      g.beginFill(0xffffff, 0.08);
      g.drawCircle(0, 0, glowRadius);
      g.endFill();
      g.beginFill(0xffffff, 0.12);
      g.drawCircle(0, 0, visualRadius + 3);
      g.endFill();
    }

    // Main circle
    g.beginFill(colorInt, 1);
    g.drawCircle(0, 0, visualRadius);
    g.endFill();

    // Ring for hovered
    if (isHovered) {
      g.lineStyle(1.5, 0xffffff, 0.7);
      g.drawCircle(0, 0, visualRadius + 2);
    }

    // Ring for neighbors
    if (isNeighbor) {
      g.lineStyle(1, 0xffffff, 0.4);
      g.drawCircle(0, 0, visualRadius + 2);
    }

    // Ring for selected
    if (isSelected && !isHovered) {
      g.lineStyle(1, 0xffffff, 0.45);
      g.drawCircle(0, 0, visualRadius + 2);
    }
  }, [graphicsRef.current, radius, isHovered, isNeighbor, isSelected, colorInt]);

  // Render text
  useEffect(() => {
    if (!containerRef.current) return;

    const shouldShowText = zoom >= graphSettings.textFadeThreshold;
    const fadeRange = 0.4;
    const textAlpha = shouldShowText
      ? Math.min(1, Math.max(0, (zoom - graphSettings.textFadeThreshold) / fadeRange))
      : 0;

    const fontSize = Math.max(8, Math.min(18, 14 / zoom));

    if (textAlpha > 0 && shouldShowText) {
      // Text background
      if (!textBgRef.current) {
        const bg = new PIXI.Graphics();
        containerRef.current.addChild(bg);
        textBgRef.current = bg;
      }

      const labelX = radius + 6;
      const labelY = -radius - 6;
      const padding = 4;
      const cornerRadius = 4;
      const textWidth = node.title.length * fontSize * 0.6;
      const textHeight = fontSize;

      textBgRef.current.clear();
      textBgRef.current.beginFill(0x000000, textAlpha * 0.35);
      textBgRef.current.drawRoundedRect(
        labelX - padding,
        labelY - textHeight / 2 - padding,
        textWidth + padding * 2,
        textHeight + padding * 2,
        cornerRadius
      );
      textBgRef.current.endFill();

      // Text
      if (!textRef.current) {
        const text = new PIXI.Text({
          text: node.title,
          style: {
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize,
            fontWeight: 'bold',
            fill: 0xffffff,
            stroke: {
              color: 0x000000,
              width: 2,
            },
            align: 'left',
          },
        });
        text.x = labelX;
        text.y = labelY;
        text.alpha = textAlpha;
        containerRef.current.addChild(text);
        textRef.current = text;
      } else {
        textRef.current.alpha = textAlpha;
        textRef.current.style.fontSize = fontSize;
        // Update stroke width
        textRef.current.style.stroke = {
          color: 0x000000,
          width: 2,
        };
      }
    } else {
      if (textRef.current) {
        containerRef.current.removeChild(textRef.current);
        textRef.current.destroy();
        textRef.current = null;
      }
      if (textBgRef.current) {
        containerRef.current.removeChild(textBgRef.current);
        textBgRef.current.destroy();
        textBgRef.current = null;
      }
    }
  }, [zoom, graphSettings.textFadeThreshold, radius, node.title, containerRef.current]);

  // Alpha for fog of war
  useEffect(() => {
    if (!containerRef.current) return;

    let alpha = 1;
    if (hoveredNodeId && !isHovered && !isNeighbor) {
      alpha = 0.18;
    }
    containerRef.current.alpha = alpha;
  }, [hoveredNodeId, isHovered, isNeighbor]);

  return null;
}
