/**
 * useViewportWidth - Hook для отслеживания реальной ширины viewport
 * Использует window.visualViewport или window.innerWidth для полноэкранной линейки
 */

import { useState, useEffect } from 'react';

export function useViewportWidth(): number {
  const [width, setWidth] = useState(() => {
    if (typeof window === 'undefined') return 1920;
    return window.visualViewport?.width ?? window.innerWidth ?? 1920;
  });

  useEffect(() => {
    const updateWidth = () => {
      const newWidth = window.visualViewport?.width ?? window.innerWidth ?? 1920;
      setWidth(newWidth);
    };

    // Используем visualViewport если доступен (учитывает клавиатуру на мобильных)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateWidth);
    } else {
      window.addEventListener('resize', updateWidth);
    }

    updateWidth();

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateWidth);
      } else {
        window.removeEventListener('resize', updateWidth);
      }
    };
  }, []);

  return width;
}

