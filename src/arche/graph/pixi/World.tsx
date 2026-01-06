import { ReactNode, createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useTick } from '@pixi/react';
import Matter from 'matter-js';
import { SimulationMode, DEFAULT_PHYSICS_CONFIG } from './physics-config';
import { AnchorForceSystem } from './anchor-forces';

interface WorldContextValue {
  engine: Matter.Engine;
  simMode: SimulationMode;
  setSimMode: (mode: SimulationMode) => void;
  reheat: () => void;
  getEnergy: () => number;
  anchorSystem: AnchorForceSystem;
}

const EngineContext = createContext<WorldContextValue | null>(null);

export const useWorld = () => {
  const context = useContext(EngineContext);
  if (!context) {
    throw new Error('useWorld must be used within World component');
  }
  return context;
};

interface WorldProps {
  children: ReactNode;
  onStateChange?: (state: { simMode: SimulationMode; energy: number; reheat: () => void }) => void;
}

export function World({ children, onStateChange }: WorldProps) {
  const [engine] = useState(() => Matter.Engine.create());
  const [simMode, setSimMode] = useState<SimulationMode>('settle');
  const [anchorSystem] = useState(() => new AnchorForceSystem());
  
  // Для отслеживания энергии
  const energyHistoryRef = useRef<number[]>([]);
  const lowEnergyFramesRef = useRef(0);

  // Инициализация движка
  useEffect(() => {
    engine.gravity.y = 0;
    engine.gravity.x = 0;
    engine.constraintIterations = DEFAULT_PHYSICS_CONFIG.constraintIterations;
    engine.positionIterations = DEFAULT_PHYSICS_CONFIG.positionIterations;
    engine.velocityIterations = DEFAULT_PHYSICS_CONFIG.velocityIterations;
  }, [engine]);

  // Вычисление текущей энергии системы
  const getEnergy = useCallback(() => {
    let totalEnergy = 0;
    const bodies = Matter.Composite.allBodies(engine.world);
    
    for (const body of bodies) {
      if (body.isStatic) continue;
      
      const vx = body.velocity.x;
      const vy = body.velocity.y;
      const speed = Math.sqrt(vx * vx + vy * vy);
      totalEnergy += speed;
    }
    
    return totalEnergy / Math.max(bodies.length, 1);
  }, [engine]);

  // Функция для принудительного "разогрева" симуляции
  const reheat = useCallback(() => {
    setSimMode('reheat');
    lowEnergyFramesRef.current = 0;
    
    // Через небольшое время переключаемся обратно на settle
    setTimeout(() => {
      setSimMode('settle');
    }, 100);
  }, []);

  // Обновление симуляции
  useTick((ticker) => {
    const config = DEFAULT_PHYSICS_CONFIG;
    // Ограничиваем delta до 16.667ms (60fps) как рекомендует Matter.js
    const rawDelta = ticker.deltaMS || 16.67;
    const delta = Math.min(rawDelta, 16.67);
    
    // Определяем timeScale в зависимости от режима
    let timeScale = 1.0;
    switch (simMode) {
      case 'settle':
        timeScale = config.timeScaleSettle;
        break;
      case 'idle':
        timeScale = config.timeScaleIdle;
        break;
      case 'drag':
        timeScale = config.timeScaleDrag;
        break;
      case 'reheat':
        timeScale = config.timeScaleReheat;
        break;
    }

    // В idle режиме не обновляем физику совсем
    if (simMode === 'idle') {
      return;
    }

    // Применяем anchor forces (только в settle и drag режимах)
    if (simMode === 'settle' || simMode === 'drag') {
      anchorSystem.applyForces(engine.world);
    }

    // Обновляем движок
    engine.timing.timeScale = timeScale;
    Matter.Engine.update(engine, delta);

    // Energy-based settling: проверяем энергию только в settle режиме
    if (simMode === 'settle') {
      const currentEnergy = getEnergy();
      energyHistoryRef.current.push(currentEnergy);
      
      // Держим только последние 10 значений
      if (energyHistoryRef.current.length > 10) {
        energyHistoryRef.current.shift();
      }

      // Проверяем, спокойна ли система
      if (currentEnergy < config.energyThreshold) {
        lowEnergyFramesRef.current++;
        
        // Если энергия низкая достаточно долго, переключаемся в idle
        if (lowEnergyFramesRef.current >= config.energyCheckFrames) {
          console.log('🛑 Physics settled, switching to idle mode');
          setSimMode('idle');
          lowEnergyFramesRef.current = 0;
        }
      } else {
        lowEnergyFramesRef.current = 0;
      }
    }
  });

  const contextValue: WorldContextValue = {
    engine,
    simMode,
    setSimMode,
    reheat,
    getEnergy,
    anchorSystem,
  };

  // Уведомляем родителя об изменении состояния
  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        simMode,
        energy: getEnergy(),
        reheat,
      });
    }
  }, [simMode, onStateChange, reheat, getEnergy]);

  return (
    <EngineContext.Provider value={contextValue}>
      {children}
    </EngineContext.Provider>
  );
}

