import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { useTick } from '@pixi/react';
import '@pixi/react';
import Matter from 'matter-js';
import { useWorld } from './World';
import { Graphics as PixiGraphics, Text as PixiText } from 'pixi.js';
import React from 'react';

import { NodePosition } from './GraphScene';
import { NODE_TYPE_CONFIGS, DEFAULT_PHYSICS_CONFIG, LOD_CONFIG } from './physics-config';

interface NodeProps {
  id: string;
  title: string;
  type?: string;
  x: number;
  y: number;
  setNodePositions: React.Dispatch<React.SetStateAction<NodePosition[]>>;
  onHover?: (id: string | null) => void;
  onClick?: (id: string) => void;
  isHovered?: boolean;
  isSelected?: boolean;
  cameraScale?: number; // для LOD
  isDimmed?: boolean; // приглушение для нод вне контекста
}

// Цвета по типу (как в оригинальном GraphView)
const getColorByType = (type?: string): number => {
  switch (type) {
    case 'person': return 0x3b82f6;
    case 'concept': return 0x10b981;
    case 'event': return 0xf59e0b;
    case 'work': return 0x8b5cf6;
    case 'place': return 0xef4444;
    case 'time': return 0x06b6d4;
    case 'note': return 0x6b7280;
    default: return 0x9ca3af;
  }
};

export const Node = memo(function Node({ 
  id, 
  title, 
  type, 
  x, 
  y, 
  setNodePositions,
  onHover,
  onClick,
  isHovered = false,
  isSelected = false,
  isNeighbor = false,
  cameraScale = 1,
  isDimmed = false,
}: NodeProps) {
  const world = useWorld();
  const { engine, anchorSystem } = world;
  const bodyRef = useRef<Matter.Body | null>(null) as React.MutableRefObject<Matter.Body>;
  const graphicsRef = useRef<PixiGraphics>(null);
  const textRef = useRef<PixiText>(null);
  const [localHovered, setLocalHovered] = useState(false);
  const lastPosition = useRef({ x, y });

  // Получаем конфигурацию для данного типа ноды
  const nodeConfig = NODE_TYPE_CONFIGS[type || 'default'] || NODE_TYPE_CONFIGS.default;
  const radius = nodeConfig.radius;

  // Создаем Matter body при монтировании
  useEffect(() => {
    bodyRef.current = Matter.Bodies.circle(x, y, radius, {
      mass: nodeConfig.mass,
      friction: DEFAULT_PHYSICS_CONFIG.friction,
      density: 0.1,
      restitution: DEFAULT_PHYSICS_CONFIG.restitution,
      frictionAir: nodeConfig.frictionAir,
      frictionStatic: 1,
      isStatic: nodeConfig.isStatic || false,
    });

    Matter.World.add(engine.world, bodyRef.current);
    
    // Регистрируем в anchor system
    anchorSystem.registerNode({
      bodyId: bodyRef.current.id,
      nodeId: id,
      type: type || 'default',
    });

    return () => {
      if (bodyRef.current) {
        anchorSystem.unregisterNode(bodyRef.current.id);
        Matter.World.remove(engine.world, bodyRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, x, y]);

  // Обновляем позицию Pixi графики из Matter body каждый кадр
  useTick(() => {
    const b = bodyRef.current;
    const g = graphicsRef.current;
    const t = textRef.current;

    if (!b || !g) return;

    // Обновляем позицию графики
    g.x = b.position.x;
    g.y = b.position.y;
    
    if (t) {
      t.x = b.position.x;
      t.y = b.position.y - radius - 10;
    }

    // Обновляем state позиций при значительном изменении (как в Josh Warren)
    if (
      Math.abs(lastPosition.current.x - b.position.x) > 0.1 ||
      Math.abs(lastPosition.current.y - b.position.y) > 0.1
    ) {
      lastPosition.current = { x: b.position.x, y: b.position.y };
      setNodePositions((prev) => {
        return prev.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              position: {
                x: b.position.x,
                y: b.position.y,
              },
            };
          }
          return node;
        });
      });
    }
  });

  // Рендерим круг с hover эффектом - мемоизируем для оптимизации
  const draw = useCallback((g: PixiGraphics) => {
    g.clear();
    
    // Увеличиваем качество рендеринга
    g.context.quality = 'high';
    
    const color = getColorByType(type);
    
    // Размеры узлов с учётом иерархии и взаимодействия
    let displayRadius = radius;
    if (isHovered || localHovered) {
      displayRadius = radius * 1.15; // +15% при hover
    } else if (isSelected) {
      displayRadius = radius * 1.20; // +20% при select
    } else if (isNeighbor) {
      displayRadius = radius * 1.08; // +8% для соседей
    }
    
    // Определяем alpha в зависимости от состояния (fog-of-war)
    let nodeAlpha = LOD_CONFIG.highlightedAlpha;
    if (isDimmed) {
      nodeAlpha = LOD_CONFIG.dimmedAlpha; // очень приглушённые
    } else if (!isHovered && !isSelected && !localHovered && !isNeighbor) {
      nodeAlpha = LOD_CONFIG.nonHighlightedAlpha; // обычные
    }
    
    // Glow для hovered/selected (только если не приглушено)
    if ((isHovered || isSelected || localHovered) && !isDimmed) {
      g.circle(0, 0, displayRadius + 3);
      g.fill({ color: 0xffffff, alpha: 0.15 });
    }
    
    // Основной круг с четкими краями
    g.circle(0, 0, displayRadius);
    g.fill({ color, alpha: nodeAlpha });
    
    // Обводка для selected
    if (isSelected) {
      g.circle(0, 0, displayRadius);
      g.stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
    }
    
    // Интерактивность
    g.eventMode = 'static';
    g.cursor = 'pointer';
    
    // Events - устанавливаем только один раз
    if (!g.onpointerenter) {
      g.onpointerenter = () => {
        setLocalHovered(true);
        onHover?.(id);
      };
      g.onpointerleave = () => {
        setLocalHovered(false);
        onHover?.(null);
      };
      g.onpointerdown = (e) => {
        // Остановить propagation чтобы не активировать pan
        e.stopPropagation();
        onClick?.(id);
      };
    }
  }, [id, type, isHovered, isSelected, isNeighbor, localHovered, onHover, onClick, radius, isDimmed]);

  // LOD: строгие правила видимости меток (Obsidian-like)
  const shouldShowLabel = () => {
    const zoom = cameraScale;
    
    // Zoom < 0.5: NO labels at all (только точки)
    if (zoom < LOD_CONFIG.labelsOffZoom) {
      return false;
    }
    
    // 0.5 <= Zoom < 0.9: только hovered/selected
    if (zoom < LOD_CONFIG.labelsHoverOnlyZoom) {
      return isHovered || localHovered || isSelected;
    }
    
    // Zoom >= 0.9: hovered/selected + их соседи
    return isHovered || localHovered || isSelected || isNeighbor;
  };

  const showLabel = shouldShowLabel();
  
  // Вычисляем размер шрифта (максимум 14px, масштабируется обратно пропорционально зуму)
  const fontSize = Math.min(14, 12 / Math.max(cameraScale, 0.5));
  
  // Обрезаем длинный текст (максимум ~30 символов)
  const truncatedTitle = title.length > 30 ? title.substring(0, 27) + '...' : title;

  return (
    <>
      <pixiGraphics ref={graphicsRef} draw={draw} />
      {showLabel && (
        <pixiText
          ref={textRef}
          text={truncatedTitle}
          style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
            fontSize: fontSize,
            fontWeight: '400', // не bold по умолчанию
            fill: 0xffffff,
            align: 'center',
            // Pill background через stroke (черный с прозрачностью)
            stroke: { color: 0x000000, width: 6 },
            strokeThickness: 6,
          }}
          anchor={{ x: 0.5, y: 1 }}
          resolution={2}
        />
      )}
    </>
  );
});

