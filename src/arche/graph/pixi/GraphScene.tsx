import { useEffect, useRef, useState, useMemo } from 'react';
import { Container as PixiContainer } from 'pixi.js';
import '@pixi/react';
import { Node } from './Node';
import { EdgeLayer } from './EdgeLayer';
import { Mouse } from './Mouse';
import { useWorld } from './World';

interface GraphSceneProps {
  nodes: Array<{ id: string; title: string; type?: string }>;
  edges: Array<{ source: string; target: string }>;
  width: number;
  height: number;
  onNodeClick?: (nodeId: string) => void;
  onNodeHover?: (nodeId: string | null) => void;
}

export interface NodePosition {
  id: string;
  position: { x: number; y: number };
}

export function GraphScene({ nodes, edges, width, height, onNodeClick, onNodeHover }: GraphSceneProps) {
  const world = useWorld(); // Keep for context
  const { anchorSystem } = world;
  const containerRef = useRef<PixiContainer>(null);
  const [camera, setCamera] = useState({
    x: 0,
    y: 0,
    scale: 1,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
  // State для позиций нод (как в Josh Warren)
  const [nodePositions, setNodePositions] = useState<NodePosition[]>(() => {
    // Начальное расположение: широко разбросанные ноды
    return nodes.map((node, idx) => {
      // Радиальное расположение с большим радиусом
      const angle = (idx / nodes.length) * Math.PI * 2;
      const radius = Math.min(width, height) * 0.35; // Увеличен радиус
      
      // Добавляем случайный разброс для более естественного вида
      const jitter = 50;
      const jitterX = (Math.random() - 0.5) * jitter;
      const jitterY = (Math.random() - 0.5) * jitter;
      
      return {
        id: node.id,
        position: {
          x: width / 2 + Math.cos(angle) * radius + jitterX,
          y: height / 2 + Math.sin(angle) * radius + jitterY,
        },
      };
    });
  });

  // Передаём связи в anchor system для spring forces
  useEffect(() => {
    anchorSystem.setLinks(edges);
  }, [edges, anchorSystem]);

  // Создаем map для быстрого доступа к позициям по ID
  const positionsMap = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    nodePositions.forEach((np) => {
      map.set(np.id, np.position);
    });
    return map;
  }, [nodePositions]);

  // Мемоизируем вычисление соседей для оптимизации
  const neighborSet = useMemo(() => {
    const set = new Set<string>();
    if (hoveredNodeId || selectedNodeId) {
      const targetId = hoveredNodeId || selectedNodeId;
      edges.forEach(edge => {
        if (edge.source === targetId) set.add(edge.target);
        if (edge.target === targetId) set.add(edge.source);
      });
    }
    return set;
  }, [hoveredNodeId, selectedNodeId, edges]);

  // Мемоизируем highlighted edges для EdgeLayer
  const highlightedEdges = useMemo(() => {
    const set = new Set<string>();
    if (hoveredNodeId || selectedNodeId) {
      const targetId = hoveredNodeId || selectedNodeId;
      edges.forEach(edge => {
        if (edge.source === targetId || edge.target === targetId) {
          set.add(`${edge.source}-${edge.target}`);
        }
      });
    }
    return set;
  }, [hoveredNodeId, selectedNodeId, edges]);

  // Wheel zoom
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      const container = containerRef.current;
      if (!container) return;

      // Zoom centered on cursor
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // World position before zoom
      const worldX = (mouseX - camera.x) / camera.scale;
      const worldY = (mouseY - camera.y) / camera.scale;

      // Calculate new scale
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.2, Math.min(3, camera.scale * zoomFactor));

      // Calculate new position to keep cursor at same world position
      const newX = mouseX - worldX * newScale;
      const newY = mouseY - worldY * newScale;

      setCamera({
        x: newX,
        y: newY,
        scale: newScale,
      });
    };

    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      return () => canvas.removeEventListener('wheel', handleWheel);
    }
  }, [camera]);

  // Pan on background drag
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      // Check if clicking on canvas (not dragging a node)
      const target = e.target as HTMLElement;
      if (target.tagName === 'CANVAS') {
        setIsDragging(true);
        setDragStart({ x: e.clientX - camera.x, y: e.clientY - camera.y });
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (isDragging) {
        setCamera(prev => ({
          ...prev,
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        }));
      }
    };

    const handlePointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, dragStart, camera]);

  return (
    <>
      <Mouse />
      <pixiContainer
        ref={containerRef}
        x={camera.x}
        y={camera.y}
        scale={camera.scale}
      >
        {/* Render edges first (behind nodes) - batched */}
        <EdgeLayer
          edges={edges}
          nodePositions={positionsMap}
          highlightedEdges={highlightedEdges}
          cameraScale={camera.scale}
        />

        {/* Render nodes second (on top) */}
        {nodes.map((node) => {
          const position = positionsMap.get(node.id) || { x: width / 2, y: height / 2 };
          const isNeighbor = neighborSet.has(node.id);
          const isTarget = node.id === hoveredNodeId || node.id === selectedNodeId;
          
          // Dimming: приглушаем ноды, которые не в контексте
          const isDimmed = (hoveredNodeId || selectedNodeId) 
            ? !isTarget && !isNeighbor 
            : false;
          
          return (
            <Node
              key={node.id}
              id={node.id}
              title={node.title}
              type={node.type}
              x={position.x}
              y={position.y}
              setNodePositions={setNodePositions}
              onHover={(nodeId) => {
                setHoveredNodeId(nodeId);
                onNodeHover?.(nodeId);
              }}
              onClick={(nodeId) => {
                setSelectedNodeId(nodeId);
                onNodeClick?.(nodeId);
              }}
              isHovered={node.id === hoveredNodeId}
              isSelected={node.id === selectedNodeId}
              isNeighbor={isNeighbor}
              cameraScale={camera.scale}
              isDimmed={isDimmed}
            />
          );
        })}
      </pixiContainer>
    </>
  );
}

