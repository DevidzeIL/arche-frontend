import { useCallback, useRef, useEffect } from 'react';
import { useTick } from '@pixi/react';
import { Graphics as PixiGraphics } from 'pixi.js';
import { LOD_CONFIG } from './physics-config';
import { useWorld } from './World';

interface EdgeLayerProps {
  edges: Array<{ source: string; target: string }>;
  nodePositions: Map<string, { x: number; y: number }>;
  highlightedEdges: Set<string>; // Set of "source-target" keys
  cameraScale: number;
}

/**
 * EdgeLayer - рендерит все рёбра в один Graphics объект (batching)
 * Throttling: перерисовывает только когда нужно (не каждый кадр в idle)
 */
export function EdgeLayer({ edges, nodePositions, highlightedEdges, cameraScale }: EdgeLayerProps) {
  const graphicsRef = useRef<PixiGraphics>(null);
  const { simMode } = useWorld();
  const frameCountRef = useRef(0);
  const needsRedrawRef = useRef(true);

  // Определяем, нужно ли рисовать edges на текущем zoom
  // Zoom < 0.45: рёбра почти невидимы
  const shouldDrawEdges = cameraScale >= LOD_CONFIG.edgesOffZoom;
  
  // Вычисляем alpha для рёбер в зависимости от зума (fade in)
  const getEdgeAlpha = (isHighlighted: boolean) => {
    if (!shouldDrawEdges) {
      return 0.01; // почти невидимы
    }
    
    if (isHighlighted) {
      return LOD_CONFIG.highlightedEdgeAlpha;
    }
    
    // Плавное появление рёбер при увеличении зума
    const fadeStart = LOD_CONFIG.edgesOffZoom;
    const fadeEnd = 0.6;
    if (cameraScale < fadeEnd) {
      const fadeProgress = (cameraScale - fadeStart) / (fadeEnd - fadeStart);
      return LOD_CONFIG.nonHighlightedEdgeAlpha * Math.max(0, Math.min(1, fadeProgress));
    }
    
    return LOD_CONFIG.nonHighlightedEdgeAlpha;
  };

  // Помечаем, что нужна перерисовка при изменении данных
  useEffect(() => {
    needsRedrawRef.current = true;
  }, [edges, highlightedEdges, cameraScale, shouldDrawEdges]);

  // Функция отрисовки всех рёбер
  const redrawEdges = useCallback(() => {
    const g = graphicsRef.current;
    if (!g) return;

    g.clear();
    
    // Улучшаем качество рендеринга линий
    g.context.quality = 'high';

    // Если zoom слишком далёкий, не рисуем edges
    if (!shouldDrawEdges) {
      return;
    }

    // Группируем рёбра по стилю для оптимизации
    const normalEdges: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    const highlightedEdgesList: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

    for (const edge of edges) {
      const sourcePos = nodePositions.get(edge.source);
      const targetPos = nodePositions.get(edge.target);

      if (!sourcePos || !targetPos) continue;

      const edgeKey = `${edge.source}-${edge.target}`;
      const isHighlighted = highlightedEdges.has(edgeKey);

      const edgeData = {
        x1: sourcePos.x,
        y1: sourcePos.y,
        x2: targetPos.x,
        y2: targetPos.y,
      };

      if (isHighlighted) {
        highlightedEdgesList.push(edgeData);
      } else {
        normalEdges.push(edgeData);
      }
    }

    // Рисуем normal edges одним batch
    if (normalEdges.length > 0) {
      for (const edge of normalEdges) {
        g.moveTo(edge.x1, edge.y1);
        g.lineTo(edge.x2, edge.y2);
      }
      g.stroke({
        width: 1,
        color: 0x999999,
        alpha: getEdgeAlpha(false),
      });
    }

    // Рисуем highlighted edges одним batch
    if (highlightedEdgesList.length > 0) {
      for (const edge of highlightedEdgesList) {
        g.moveTo(edge.x1, edge.y1);
        g.lineTo(edge.x2, edge.y2);
      }
      g.stroke({
        width: 2,
        color: 0x60a5fa,
        alpha: getEdgeAlpha(true),
      });
    }
  }, [edges, nodePositions, highlightedEdges, shouldDrawEdges, cameraScale]);

  // Throttled redraw на основе режима симуляции
  useTick(() => {
    frameCountRef.current++;

    // Определяем частоту перерисовки
    let throttleInterval = 1;
    
    switch (simMode) {
      case 'idle':
        // В idle не перерисовываем, только если явно помечено
        if (!needsRedrawRef.current) return;
        break;
      case 'settle':
        // В settle перерисовываем каждые 2 кадра
        throttleInterval = 2;
        break;
      case 'drag':
      case 'reheat':
        // В drag/reheat перерисовываем каждый кадр
        throttleInterval = 1;
        break;
    }

    if (frameCountRef.current % throttleInterval === 0 || needsRedrawRef.current) {
      redrawEdges();
      needsRedrawRef.current = false;
    }
  });

  return <pixiGraphics ref={graphicsRef} />;
}

