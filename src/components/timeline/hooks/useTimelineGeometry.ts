/**
 * useTimelineGeometry - Hook для управления геометрией Timeline
 * КРИТИЧНО: Geometry НЕ содержит scrollYear - это отдельное состояние Camera
 * Использует реальную ширину viewport (100vw) через useViewportWidth
 */

import { useState, useEffect, useRef } from 'react';
import { TimelineGeometry, createGeometry } from '../core/projection';
import { useViewportWidth } from './useViewportWidth';

interface UseTimelineGeometryProps {
  startYear: number;
  endYear: number;
  zoomLevel: 'out' | 'mid' | 'in';
}

export function useTimelineGeometry({
  startYear,
  endYear,
  zoomLevel,
}: UseTimelineGeometryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportWidth = useViewportWidth(); // ✅ реальная ширина viewport (100vw)
  
  const [geometry, setGeometry] = useState<TimelineGeometry>(() => {
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    return createGeometry({
      startYear,
      endYear,
      viewportWidth,
      viewportHeight,
      zoomLevel,
    });
  });
  
  // Обновление размеров через ResizeObserver (только высота контейнера)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    let rafId: number | null = null;
    
    const observer = new ResizeObserver((entries) => {
      if (rafId) cancelAnimationFrame(rafId);
      
      rafId = requestAnimationFrame(() => {
        for (const entry of entries) {
          const rect = entry.target.getBoundingClientRect();
          const height = rect.height;
          
          setGeometry(prev => {
            // viewportWidth берется из useViewportWidth (100vw)
            if (Math.abs(prev.viewportHeight - height) < 1) {
              return prev;
            }
            
            return createGeometry({
              startYear,
              endYear,
              viewportWidth, // ✅ всегда реальная ширина viewport
              viewportHeight: height,
              zoomLevel,
            });
          });
        }
      });
    });
    
    observer.observe(container);
    
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [startYear, endYear, zoomLevel, viewportWidth]);
  
  // Обновление при изменении viewportWidth или zoomLevel
  useEffect(() => {
    const viewportHeight = containerRef.current?.getBoundingClientRect().height ?? 800;
    setGeometry(prev => {
      // Обновляем только если изменились параметры
      if (
        prev.startYear === startYear &&
        prev.endYear === endYear &&
        Math.abs(prev.viewportWidth - viewportWidth) < 1 &&
        Math.abs(prev.viewportHeight - viewportHeight) < 1 &&
        prev.pxPerYear === createGeometry({ startYear, endYear, viewportWidth, viewportHeight, zoomLevel }).pxPerYear
      ) {
        return prev;
      }
      
      return createGeometry({
        startYear,
        endYear,
        viewportWidth, // ✅ всегда реальная ширина viewport
        viewportHeight,
        zoomLevel,
      });
    });
  }, [startYear, endYear, viewportWidth, zoomLevel]);
  
  return { geometry, containerRef };
}


