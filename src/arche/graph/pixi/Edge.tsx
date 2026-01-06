import '@pixi/react';
import { useCallback } from 'react';

interface EdgeProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isHighlighted?: boolean;
}

type Draw = (g: any) => void;

export function Edge({ x1, y1, x2, y2, isHighlighted = false }: EdgeProps) {
  // Простой компонент с draw callback (как в Josh Warren)
  const draw = useCallback<Draw>(
    (g) => {
      g.clear();
      
      // Параметры в зависимости от highlight
      const lineWidth = isHighlighted ? 2 : 1;
      const color = isHighlighted ? 0x60a5fa : 0x999999;
      const alpha = isHighlighted ? 0.8 : 0.5;
      
      g.lineStyle(lineWidth, color, alpha);
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
    },
    [x1, y1, x2, y2, isHighlighted]
  );

  // Используем pixiGraphics JSX-компонент (зарегистрирован через extend)
  return <pixiGraphics draw={draw} />;
}

