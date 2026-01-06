// Конфигурация физики и констант для Josh-подобного графа

export type SimulationMode = 'settle' | 'idle' | 'drag' | 'reheat';

export interface PhysicsConfig {
  // Engine
  constraintIterations: number;
  positionIterations: number;
  velocityIterations: number;
  
  // Bodies (базовые значения)
  frictionAir: number;
  restitution: number;
  friction: number;
  
  // Simulation
  energyThreshold: number; // порог для определения "спокойствия"
  energyCheckFrames: number; // сколько кадров подряд должна быть низкая энергия
  
  // Time scale
  timeScaleSettle: number;
  timeScaleIdle: number;
  timeScaleDrag: number;
  timeScaleReheat: number;
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  constraintIterations: 6,
  positionIterations: 4,
  velocityIterations: 3,
  
  frictionAir: 0.15, // увеличено для более стабильного поведения
  restitution: 0,
  friction: 0.1,
  
  energyThreshold: 0.05, // более строгий порог для автозамораживания
  energyCheckFrames: 100, // кадров для уверенности в стабильности (80-120 как указано)
  
  timeScaleSettle: 1.0,
  timeScaleIdle: 0, // полная остановка в idle
  timeScaleDrag: 1.0,
  timeScaleReheat: 1.0,
};

// Параметры нод по типам
export interface NodeTypeConfig {
  mass: number;
  frictionAir: number;
  radius: number;
  isStatic?: boolean;
}

// Иерархия размеров: concept/time > person > work > note
export const NODE_TYPE_CONFIGS: Record<string, NodeTypeConfig> = {
  hub: {
    mass: 12,
    frictionAir: 0.15,
    radius: 18, // самый большой
    isStatic: false,
  },
  time: {
    mass: 3,
    frictionAir: 0.13,
    radius: 14, // крупные (эпохи/периоды)
  },
  concept: {
    mass: 2.5,
    frictionAir: 0.13,
    radius: 14, // крупные (концепции)
  },
  person: {
    mass: 1.5,
    frictionAir: 0.12,
    radius: 11, // средние (авторы)
  },
  event: {
    mass: 1.2,
    frictionAir: 0.12,
    radius: 10, // средние
  },
  place: {
    mass: 1.2,
    frictionAir: 0.12,
    radius: 10, // средние
  },
  work: {
    mass: 1,
    frictionAir: 0.12,
    radius: 9, // маленькие (работы/тексты)
  },
  note: {
    mass: 0.8,
    frictionAir: 0.12,
    radius: 7, // самые маленькие (заметки/теги)
  },
  default: {
    mass: 1,
    frictionAir: 0.12,
    radius: 10,
  },
};

// Anchor силы
export const ANCHOR_FORCES = {
  timeAxis: {
    k: 0.00003, // коэффициент силы притяжения к оси
    spacing: 180, // расстояние между time нодами
    targetY: 0, // ось Y для time нод
  },
  hubGravity: {
    k: 0.00002, // притяжение к hub
  },
  repulsion: {
    strength: 10000, // увеличена сила отталкивания для уменьшения "hairball"
    minDistance: 120, // увеличенное минимальное расстояние
  },
  linkSpring: {
    stiffness: 0.0001, // немного увеличена для стабильности
    damping: 0.6, // больше демпфирования
    restLength: 180, // увеличенная длина для уменьшения "hairball"
  },
};

// LOD уровни - строгие правила для Obsidian-like графа
export const LOD_CONFIG = {
  // Edge visibility
  edgesOffZoom: 0.45, // рёбра начинают появляться только при zoom >= 0.45
  edgesFadeInZoom: 0.45, // начало появления рёбер
  
  // Label visibility - строгие пороги
  labelsOffZoom: 0.5, // NO labels при zoom < 0.5
  labelsHoverOnlyZoom: 0.9, // только hover/selected при 0.5 <= zoom < 0.9
  labelsNeighborsZoom: 0.9, // hover/selected + neighbors при zoom >= 0.9
  
  // Fade alpha - более агрессивное приглушение
  nonHighlightedAlpha: 0.15, // приглушённые узлы
  highlightedAlpha: 1.0, // активные узлы
  dimmedAlpha: 0.08, // очень приглушённые (fog-of-war)
  
  // Edge alpha - очень низкая по умолчанию
  nonHighlightedEdgeAlpha: 0.06, // почти невидимые рёбра по умолчанию
  highlightedEdgeAlpha: 0.9, // яркие при hover/select
};

