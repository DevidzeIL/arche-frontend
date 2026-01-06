import { Application, extend, useApplication } from '@pixi/react';
import { Container, Graphics, Text } from 'pixi.js';
import { useEffect, useRef } from 'react';
import { World } from './World';
import { GraphScene } from './GraphScene';
import { SimulationMode } from './physics-config';

// Регистрируем Pixi.js компоненты для использования в JSX
extend({ Container, Graphics, Text });

interface GraphCanvasProps {
  width: number;
  height: number;
  nodes: Array<{ id: string; title: string; type?: string }>;
  edges: Array<{ source: string; target: string }>;
  onNodeClick?: (nodeId: string) => void;
  onNodeHover?: (nodeId: string | null) => void;
  onSimulationStateChange?: (state: { simMode: SimulationMode; energy: number; reheat: () => void }) => void;
}

// Компонент для автоматического изменения размера canvas
function CanvasResizer({ width, height }: { width: number; height: number }) {
  const app = useApplication();
  
  useEffect(() => {
    if (!app?.app) return;
    
    const pixiApp = app.app;
    
    // Функция для установки стилей canvas
    const setCanvasStyles = () => {
      // Проверяем, что renderer инициализирован
      if (!pixiApp.renderer || !pixiApp.canvas) return;
      
      const canvas = pixiApp.canvas as HTMLCanvasElement;
      if (canvas) {
        // КРИТИЧНО: устанавливаем точные пиксельные размеры для четкости
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        canvas.style.display = 'block';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        // Отключаем сглаживание для четкости
        canvas.style.imageRendering = 'auto';
      }
    };
    
    // Если renderer уже готов, устанавливаем стили сразу
    if (pixiApp.renderer && pixiApp.canvas) {
      setCanvasStyles();
    } else {
      // Иначе ждём инициализации renderer
      const checkRenderer = () => {
        if (pixiApp.renderer && pixiApp.canvas) {
          setCanvasStyles();
        } else {
          setTimeout(checkRenderer, 50);
        }
      };
      checkRenderer();
    }
    
    // Обработка WebGL context lost/restored
    const handleContextLost = (event: Event) => {
      console.warn('⚠️ WebGL context lost, preventing default...');
      event.preventDefault();
    };
    
    const handleContextRestored = () => {
      console.log('✅ WebGL context restored');
      // Pixi.js автоматически восстановит рендеринг
    };
    
    // Добавляем обработчики только если canvas доступен
    const setupContextHandlers = () => {
      if (!pixiApp.renderer || !pixiApp.canvas) return;
      
      const canvas = pixiApp.canvas as HTMLCanvasElement;
      if (canvas) {
        canvas.addEventListener('webglcontextlost', handleContextLost);
        canvas.addEventListener('webglcontextrestored', handleContextRestored);
        
        return () => {
          canvas.removeEventListener('webglcontextlost', handleContextLost);
          canvas.removeEventListener('webglcontextrestored', handleContextRestored);
        };
      }
    };
    
    // Если renderer готов, устанавливаем обработчики сразу
    if (pixiApp.renderer && pixiApp.canvas) {
      return setupContextHandlers();
    } else {
      // Иначе ждём инициализации
      const timer = setTimeout(() => {
        setupContextHandlers();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [app, width, height]);
  
  return null;
}

export function GraphCanvas({ width, height, nodes, edges, onNodeClick, onNodeHover, onSimulationStateChange }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  return (
    <div 
      ref={containerRef}
      style={{ 
        width: '100%', 
        height: '100%',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <Application
        width={width}
        height={height}
        backgroundColor={0x0a0a0a}
        antialias={true}
        autoDensity={true}
        resolution={Math.min(window.devicePixelRatio || 1, 2)}
        powerPreference="high-performance"
      >
        <CanvasResizer width={width} height={height} />
        <World onStateChange={onSimulationStateChange}>
          <GraphScene 
            nodes={nodes} 
            edges={edges} 
            width={width} 
            height={height}
            onNodeClick={onNodeClick}
            onNodeHover={onNodeHover}
          />
        </World>
      </Application>
    </div>
  );
}
