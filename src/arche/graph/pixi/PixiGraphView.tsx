import { useRef, useEffect, useState } from 'react';
import { GraphCanvas } from './GraphCanvas';
import { SimulationMode } from './physics-config';

interface PixiGraphViewProps {
  nodes: Array<{ id: string; title: string; type?: string }>;
  edges: Array<{ source: string; target: string }>;
  onNodeClick?: (nodeId: string) => void;
  onNodeHover?: (nodeId: string | null) => void;
}

export function PixiGraphView({ nodes, edges, onNodeClick, onNodeHover }: PixiGraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [simState, setSimState] = useState<{ simMode: SimulationMode; energy: number; reheat: () => void } | null>(null);

  // Отслеживаем размер контейнера
  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height });
      }
    };

    // Инициализация
    updateDimensions();

    // ResizeObserver для динамического изменения размера
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Убеждаемся, что canvas занимает весь контейнер с правильным масштабированием
  useEffect(() => {
    const updateCanvasStyles = () => {
      const canvas = containerRef.current?.querySelector('canvas');
      if (canvas) {
        // Устанавливаем точные размеры для избежания размытости
        canvas.style.width = `${dimensions.width}px`;
        canvas.style.height = `${dimensions.height}px`;
        canvas.style.display = 'block';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.imageRendering = 'auto';
      }
    };
    
    // Обновляем стили сразу и после небольшой задержки (для случая, если canvas ещё не создан)
    updateCanvasStyles();
    const timeout = setTimeout(updateCanvasStyles, 100);
    
    return () => clearTimeout(timeout);
  }, [dimensions]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <GraphCanvas
        width={dimensions.width}
        height={dimensions.height}
        nodes={nodes}
        edges={edges}
        onNodeClick={onNodeClick}
        onNodeHover={onNodeHover}
        onSimulationStateChange={setSimState}
      />
      
      {/* SimulationControls как HTML overlay поверх canvas */}
      {simState && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          padding: '10px 15px',
          borderRadius: '8px',
          fontSize: '12px',
          zIndex: 1000,
          fontFamily: 'monospace',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ opacity: 0.7 }}>Режим:</span>
            <span style={{ 
              fontWeight: 'bold',
              color: simState.simMode === 'idle' ? '#10b981' : simState.simMode === 'settle' ? '#f59e0b' : '#ef4444'
            }}>
              {simState.simMode.toUpperCase()}
            </span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ opacity: 0.7 }}>Энергия:</span>
            <span style={{ fontWeight: 'bold' }}>
              {simState.energy.toFixed(3)}
            </span>
          </div>
          
          <button
            onClick={() => simState.reheat()}
            disabled={simState.simMode === 'drag'}
            style={{
              background: simState.simMode === 'drag' ? '#4b5563' : '#3b82f6',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: simState.simMode === 'drag' ? 'not-allowed' : 'pointer',
              fontSize: '11px',
              fontWeight: 'bold',
              opacity: simState.simMode === 'drag' ? 0.5 : 1,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (simState.simMode !== 'drag') {
                e.currentTarget.style.background = '#2563eb';
              }
            }}
            onMouseLeave={(e) => {
              if (simState.simMode !== 'drag') {
                e.currentTarget.style.background = '#3b82f6';
              }
            }}
          >
            🔥 Reheat / Animate
          </button>
        </div>
      )}
    </div>
  );
}

