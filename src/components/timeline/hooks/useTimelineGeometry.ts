/**
 * useTimelineGeometry - Hook для управления геометрией Timeline
 * Обеспечивает стабильные размеры через ResizeObserver
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { TimelineGeometry, createGeometry } from '../core/timelineMath';

interface UseTimelineGeometryProps {
  startYear: number;
  endYear: number;
  scrollYear: number;
  zoomLevel: 'out' | 'mid' | 'in';
}

export function useTimelineGeometry({
  startYear,
  endYear,
  scrollYear,
  zoomLevel,
}: UseTimelineGeometryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<TimelineGeometry>(() =>
    createGeometry({
      startYear,
      endYear,
      viewportWidth: 1000, // fallback
      viewportHeight: 600,
      scrollYear,
      zoomLevel,
    })
  );
  
  // Обновление размеров через ResizeObserver (СТАБИЛЬНЫЙ)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    let rafId: number | null = null;
    
    const observer = new ResizeObserver((entries) => {
      // Debounce через RAF
      if (rafId) cancelAnimationFrame(rafId);
      
      rafId = requestAnimationFrame(() => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          
          // Обновляем геометрию только если размеры реально изменились
          setGeometry(prev => {
            if (
              Math.abs(prev.viewportWidth - width) < 1 &&
              Math.abs(prev.viewportHeight - height) < 1
            ) {
              return prev; // не вызываем rerender
            }
            
            return createGeometry({
              startYear,
              endYear,
              viewportWidth: width,
              viewportHeight: height,
              scrollYear,
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
  }, [startYear, endYear, scrollYear, zoomLevel]);
  
  // Обновление scroll/zoom
  useEffect(() => {
    setGeometry(prev =>
      createGeometry({
        startYear,
        endYear,
        viewportWidth: prev.viewportWidth,
        viewportHeight: prev.viewportHeight,
        scrollYear,
        zoomLevel,
      })
    );
  }, [startYear, endYear, scrollYear, zoomLevel]);
  
  return { geometry, containerRef };
}

