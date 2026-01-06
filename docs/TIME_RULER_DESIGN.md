# Time Ruler — Проектирование и Архитектура

## 1. UX Описание

### Основная Концепция
Time Ruler — это интерактивная хронологическая ось, работающая как "музейная галерея во времени". Пользователь скроллит мышью/трекпадом, путешествуя по эпохам, и видит карточки событий/персон/работ, которые плавно появляются в фокусе.

### Визуальная Структура

```
┌───────────────────────────────────────────────────────────────────┐
│  [Фильтры: person | concept | work | time]   [Масштаб: ▢ ▣ ▦]    │
├───────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ←  -500 ──────┬────────┬────────┬────────┬────────→ 2025  →     │
│               |        |        |        |                        │
│           Античность Средние Возрожд  Новое                      │
│                 ▼        века      ▼     время                    │
│             ┌────────┐         ┌────────┐                         │
│             │Платон  │         │Декарт  │◄── карточки            │
│             │384-322 │         │1596-   │    в фокусе            │
│             └────────┘         │1650    │                         │
│                                └────────┘                         │
│                                                                    │
│  [Mini-map: ━━━━━━━━━━━━━━━━━━━━━━━━━]◄── текущая позиция       │
└───────────────────────────────────────────────────────────────────┘
```

### Режимы Масштаба (LOD)

#### Level 1: Zoomed Out (1 px = 10-20 лет)
- Показываем: века, эпохи
- Карточки: только hub/time типы, крупные концепции
- Метки: каждые 100 лет
- Цель: панорамный обзор всей истории

#### Level 2: Mid (1 px = 2-5 лет)
- Показываем: десятилетия
- Карточки: person, concept, work (ограниченно)
- Метки: каждые 10 лет
- Цель: навигация по периоду

#### Level 3: Zoomed In (1 px = 1 год или меньше)
- Показываем: годы, конкретные даты
- Карточки: все типы, включая note, event
- Метки: каждый год
- Цель: детальное изучение периода

### Снап (Snap Points)
Значимые точки, к которым "прилипает" скролл:
- Начало/конец эпох
- Рождение/смерть важных персон
- Публикация ключевых работ
- События

---

## 2. Архитектура Компонентов

### Иерархия

```
TimeRuler (контейнер)
├── TimelineFilters (фильтры + масштаб)
├── TimelineViewport (основная область)
│   ├── TimelineTrack (центральная линия + метки)
│   │   ├── TickMarks (метки времени: века/годы)
│   │   └── EpochBands (полосы эпох)
│   ├── TimelineCards (виртуализированные карточки)
│   │   └── TimelineCard (отдельная карточка)
│   └── FocusOverlay (приглушение при focus mode)
└── TimelineMiniMap (мини-карта навигации)
```

### Детали Компонентов

#### TimeRuler (главный контейнер)
```typescript
interface TimeRulerProps {
  notes: ArcheNote[];
  orientation?: 'horizontal' | 'vertical';
  defaultYear?: number;
  onNoteClick?: (noteId: string) => void;
}

interface TimeRulerState {
  // Текущая позиция на таймлайне (год)
  currentPosition: number;
  
  // Масштаб (LOD)
  zoomLevel: 'out' | 'mid' | 'in';
  
  // Фильтры
  filters: {
    types: string[];
    domains: string[];
    statuses: string[];
  };
  
  // Focus mode
  focusedNoteId: string | null;
  
  // Snap points
  snapPoints: SnapPoint[];
  
  // Виртуализация
  visibleRange: { start: number; end: number };
}

interface SnapPoint {
  year: number;
  label: string;
  importance: 'high' | 'medium' | 'low';
  noteId?: string;
}
```

#### TimelineTrack (линия + метки)
```typescript
interface TimelineTrackProps {
  startYear: number;
  endYear: number;
  currentPosition: number;
  zoomLevel: 'out' | 'mid' | 'in';
  epochs: Epoch[];
}

interface Epoch {
  name: string;
  startYear: number;
  endYear: number;
  color?: string;
}

// Вычисление меток
function calculateTickMarks(
  startYear: number,
  endYear: number,
  zoomLevel: 'out' | 'mid' | 'in'
): TickMark[] {
  const interval = zoomLevel === 'out' ? 100 : zoomLevel === 'mid' ? 10 : 1;
  const marks: TickMark[] = [];
  
  for (let year = startYear; year <= endYear; year += interval) {
    const isMajor = year % 100 === 0;
    marks.push({
      year,
      label: formatYearLabel(year, zoomLevel),
      size: isMajor ? 'large' : 'small',
    });
  }
  
  return marks;
}
```

#### TimelineCards (виртуализированные карточки)
```typescript
interface TimelineCardsProps {
  notes: TimelineNote[];
  visibleRange: { start: number; end: number };
  currentPosition: number;
  zoomLevel: 'out' | 'mid' | 'in';
  focusedNoteId: string | null;
  onCardClick: (noteId: string) => void;
}

interface TimelineNote extends ArcheNote {
  // Временные метаданные
  startYear: number;
  endYear?: number;
  displayYear: number; // для позиционирования
  importance: number; // 0-1, для LOD
}

// Виртуализация: рендерим только карточки в видимом диапазоне + buffer
function getVisibleCards(
  notes: TimelineNote[],
  visibleRange: { start: number; end: number },
  buffer: number = 50
): TimelineNote[] {
  return notes.filter(note => {
    const noteYear = note.displayYear;
    return noteYear >= visibleRange.start - buffer &&
           noteYear <= visibleRange.end + buffer;
  });
}

// LOD фильтрация
function filterByLOD(
  notes: TimelineNote[],
  zoomLevel: 'out' | 'mid' | 'in'
): TimelineNote[] {
  const importanceThreshold = {
    out: 0.7,  // только важные
    mid: 0.4,  // средние и важные
    in: 0,     // все
  }[zoomLevel];
  
  return notes.filter(note => note.importance >= importanceThreshold);
}
```

#### TimelineFilters
```typescript
interface TimelineFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  zoomLevel: 'out' | 'mid' | 'in';
  onZoomChange: (level: 'out' | 'mid' | 'in') => void;
}

interface FilterState {
  types: string[];
  domains: string[];
  statuses: string[];
}
```

#### TimelineMiniMap
```typescript
interface TimelineMiniMapProps {
  startYear: number;
  endYear: number;
  currentPosition: number;
  visibleRangeWidth: number;
  epochs: Epoch[];
  onPositionChange: (year: number) => void;
}

// Мини-карта показывает всю шкалу времени и текущее окно
// Клик по мини-карте мгновенно перемещает к выбранному году
```

---

## 3. Алгоритмы

### 3.1 Снап (Snap Algorithm)

```typescript
interface SnapConfig {
  enabled: boolean;
  threshold: number; // пиксели, в пределах которых снапаем
  strength: number; // 0-1, насколько сильно "притягивает"
}

function calculateSnap(
  targetPosition: number,
  snapPoints: SnapPoint[],
  config: SnapConfig
): number {
  if (!config.enabled) return targetPosition;
  
  // Находим ближайший snap point
  let closestSnap: SnapPoint | null = null;
  let minDistance = Infinity;
  
  for (const snapPoint of snapPoints) {
    const distance = Math.abs(snapPoint.year - targetPosition);
    if (distance < minDistance && distance < config.threshold) {
      minDistance = distance;
      closestSnap = snapPoint;
    }
  }
  
  if (!closestSnap) return targetPosition;
  
  // Применяем снап с easing
  const snapStrength = config.strength * (1 - minDistance / config.threshold);
  return lerp(targetPosition, closestSnap.year, snapStrength);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Генерация snap points из заметок
function generateSnapPoints(notes: TimelineNote[]): SnapPoint[] {
  const points: SnapPoint[] = [];
  
  notes.forEach(note => {
    // Персоны: рождение и смерть
    if (note.type === 'person' && note.startYear) {
      points.push({
        year: note.startYear,
        label: `${note.title} родился`,
        importance: note.importance > 0.7 ? 'high' : 'medium',
        noteId: note.id,
      });
      
      if (note.endYear) {
        points.push({
          year: note.endYear,
          label: `${note.title} умер`,
          importance: 'low',
          noteId: note.id,
        });
      }
    }
    
    // Работы: публикация
    if (note.type === 'work' && note.startYear) {
      points.push({
        year: note.startYear,
        label: note.title,
        importance: note.importance > 0.6 ? 'high' : 'medium',
        noteId: note.id,
      });
    }
    
    // Эпохи: начало и конец
    if (note.type === 'time' && note.startYear && note.endYear) {
      points.push({
        year: note.startYear,
        label: `Начало: ${note.title}`,
        importance: 'high',
        noteId: note.id,
      });
      points.push({
        year: note.endYear,
        label: `Конец: ${note.title}`,
        importance: 'high',
        noteId: note.id,
      });
    }
  });
  
  return points;
}
```

### 3.2 Скролл с Инерцией

```typescript
class ScrollController {
  private velocity = 0;
  private position = 0;
  private targetPosition = 0;
  private isDragging = false;
  private lastTimestamp = 0;
  private friction = 0.92;
  private snapConfig: SnapConfig;
  
  constructor(
    private onPositionChange: (position: number) => void,
    snapConfig: SnapConfig
  ) {
    this.snapConfig = snapConfig;
    this.startAnimation();
  }
  
  handleWheel(deltaY: number): void {
    // Конвертируем delta в изменение позиции (года)
    const yearsDelta = deltaY * 0.1; // настройка чувствительности
    this.targetPosition += yearsDelta;
    this.velocity = yearsDelta * 0.5; // добавляем инерцию
  }
  
  handleDragStart(): void {
    this.isDragging = true;
    this.velocity = 0;
  }
  
  handleDrag(deltaX: number): void {
    if (!this.isDragging) return;
    const yearsDelta = deltaX * 0.05;
    this.targetPosition -= yearsDelta;
  }
  
  handleDragEnd(): void {
    this.isDragging = false;
  }
  
  private startAnimation(): void {
    const animate = (timestamp: number) => {
      if (this.lastTimestamp === 0) {
        this.lastTimestamp = timestamp;
      }
      
      const deltaTime = timestamp - this.lastTimestamp;
      this.lastTimestamp = timestamp;
      
      if (!this.isDragging) {
        // Применяем инерцию
        this.velocity *= this.friction;
        
        // Двигаемся к целевой позиции с easing
        const diff = this.targetPosition - this.position;
        this.position += diff * 0.1 + this.velocity;
        
        // Snap
        if (Math.abs(this.velocity) < 0.1) {
          this.position = calculateSnap(
            this.position,
            this.snapPoints,
            this.snapConfig
          );
        }
      } else {
        this.position = this.targetPosition;
      }
      
      this.onPositionChange(this.position);
      requestAnimationFrame(animate);
    };
    
    requestAnimationFrame(animate);
  }
}
```

### 3.3 Виртуализация

```typescript
class VirtualizedTimeline {
  private containerHeight: number;
  private itemHeight = 200; // высота одной карточки
  private buffer = 5; // сколько карточек рендерим за пределами viewport
  
  constructor(containerHeight: number) {
    this.containerHeight = containerHeight;
  }
  
  getVisibleItems(
    allItems: TimelineNote[],
    scrollTop: number
  ): { items: TimelineNote[]; offsetY: number; totalHeight: number } {
    const startIndex = Math.floor(scrollTop / this.itemHeight) - this.buffer;
    const endIndex = Math.ceil((scrollTop + this.containerHeight) / this.itemHeight) + this.buffer;
    
    const visibleItems = allItems.slice(
      Math.max(0, startIndex),
      Math.min(allItems.length, endIndex)
    );
    
    const offsetY = Math.max(0, startIndex) * this.itemHeight;
    const totalHeight = allItems.length * this.itemHeight;
    
    return { items: visibleItems, offsetY, totalHeight };
  }
}
```

### 3.4 LOD (Level of Detail)

```typescript
function calculateLOD(
  note: TimelineNote,
  currentZoom: 'out' | 'mid' | 'in',
  distanceFromCenter: number
): {
  visible: boolean;
  scale: number;
  opacity: number;
} {
  // Базовая видимость по важности
  const importanceThresholds = {
    out: 0.7,
    mid: 0.4,
    in: 0,
  };
  
  if (note.importance < importanceThresholds[currentZoom]) {
    return { visible: false, scale: 0, opacity: 0 };
  }
  
  // Дистанция влияет на размер и прозрачность (fog of war)
  const maxDistance = currentZoom === 'out' ? 100 : currentZoom === 'mid' ? 50 : 20;
  const distanceRatio = Math.min(1, distanceFromCenter / maxDistance);
  
  const scale = 1 - distanceRatio * 0.3; // уменьшаем до 0.7
  const opacity = 1 - distanceRatio * 0.6; // fade до 0.4
  
  return {
    visible: true,
    scale: Math.max(0.5, scale),
    opacity: Math.max(0.3, opacity),
  };
}
```

---

## 4. Требования к Данным

### Расширение ArcheNote

```typescript
interface ArcheNote {
  // ... существующие поля
  
  // Временные метаданные (новые)
  timeline?: {
    startYear?: number; // основной год или начало периода
    endYear?: number; // конец периода (для персон, эпох, событий)
    displayYear?: number; // год для отображения (если разный от startYear)
    importance?: number; // 0-1, для LOD фильтрации
    precision?: 'exact' | 'approximate' | 'century'; // точность датировки
  };
}
```

### Парсинг Дат из Заметок

```typescript
function enrichNoteWithTimeline(note: ArcheNote): ArcheNote {
  const timeline = extractTimelineFromNote(note);
  return { ...note, timeline };
}

function extractTimelineFromNote(note: ArcheNote): TimelineMetadata | undefined {
  // 1. Проверяем frontmatter
  if (note.created || note.updated) {
    // Может быть явные поля start_year, end_year
  }
  
  // 2. Извлекаем из body
  const yearPatterns = [
    // "384-322 до н.э."
    /(\d{3,4})\s*[-–—]\s*(\d{3,4})\s*(?:до\s*н\.?\s*э\.?)?/gi,
    // "1596-1650"
    /(\d{4})\s*[-–—]\s*(\d{4})/g,
    // "384 до н.э."
    /(\d{3,4})\s*(?:до\s*н\.?\s*э\.?)/gi,
    // просто год
    /\b(\d{4})\b/g,
  ];
  
  const years: number[] = [];
  yearPatterns.forEach(pattern => {
    const matches = [...note.body.matchAll(pattern)];
    matches.forEach(match => {
      let year = parseInt(match[1], 10);
      if (match[0].includes('до н.э')) {
        year = -year;
      }
      if (year >= -1000 && year <= 2100) {
        years.push(year);
      }
    });
  });
  
  if (years.length === 0) return undefined;
  
  // 3. Определяем важность
  const importance = calculateImportance(note);
  
  return {
    startYear: Math.min(...years),
    endYear: years.length > 1 ? Math.max(...years) : undefined,
    displayYear: years[0],
    importance,
    precision: 'approximate',
  };
}

function calculateImportance(note: ArcheNote): number {
  let score = 0.5; // базовая важность
  
  // Тип увеличивает важность
  if (note.type === 'hub') score += 0.3;
  if (note.type === 'time') score += 0.3;
  if (note.type === 'concept') score += 0.2;
  if (note.type === 'person') score += 0.1;
  
  // Количество связей
  if (note.links) {
    score += Math.min(0.2, note.links.length * 0.01);
  }
  
  // Статус
  if (note.status === 'mature' || note.status === 'evergreen') {
    score += 0.1;
  }
  
  return Math.min(1, score);
}
```

### Пример Frontmatter

```markdown
---
id: person-aristotle-001
type: person
domain: [philosophy, science]
status: mature
timeline:
  start_year: -384
  end_year: -322
  importance: 0.9
  precision: exact
---
# Аристотель

Древнегреческий философ...
```

---

## 5. Варианты Реализации

### A) CSS/DOM + Виртуализация (Рекомендуемый)

**Преимущества:**
- Надежность, легкость отладки
- SEO-friendly (содержимое в DOM)
- Доступность (a11y)
- Простота интеграции с React

**Технологии:**
- `react-window` или `react-virtualized` для виртуализации
- CSS transforms для позиционирования
- `IntersectionObserver` для lazy loading
- CSS transitions для анимаций

**Структура:**

```tsx
// Горизонтальная виртуализированная линейка
import { VariableSizeList } from 'react-window';

function TimeRulerDOM({ notes }: TimeRulerProps) {
  const [currentPosition, setCurrentPosition] = useState(1900);
  const [zoomLevel, setZoomLevel] = useState<'out' | 'mid' | 'in'>('mid');
  
  // Виртуализация
  const listRef = useRef<VariableSizeList>(null);
  
  // Скролл контроллер
  const scrollController = useMemo(
    () => new ScrollController(setCurrentPosition, snapConfig),
    []
  );
  
  // Фильтрация и LOD
  const visibleNotes = useMemo(() => {
    return notes
      .filter(applyFilters)
      .filter(note => filterByLOD(note, zoomLevel))
      .sort((a, b) => a.timeline.startYear - b.timeline.startYear);
  }, [notes, filters, zoomLevel]);
  
  return (
    <div className="time-ruler">
      <TimelineFilters />
      <div
        className="timeline-viewport"
        onWheel={(e) => scrollController.handleWheel(e.deltaY)}
      >
        <TimelineTrack
          currentPosition={currentPosition}
          zoomLevel={zoomLevel}
        />
        <VariableSizeList
          ref={listRef}
          height={600}
          itemCount={visibleNotes.length}
          itemSize={(index) => getItemHeight(visibleNotes[index], zoomLevel)}
          width="100%"
          layout="horizontal"
        >
          {({ index, style }) => (
            <TimelineCard
              note={visibleNotes[index]}
              style={style}
              zoomLevel={zoomLevel}
            />
          )}
        </VariableSizeList>
      </div>
      <TimelineMiniMap />
    </div>
  );
}
```

**CSS для плавности:**

```css
.timeline-card {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: transform, opacity;
}

.timeline-track {
  position: relative;
  height: 100%;
}

.timeline-track::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--border);
  transform: translateY(-50%);
}

/* Grain overlay */
.timeline-viewport::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.02;
  background-image: url(...);
  mix-blend-mode: overlay;
}
```

### B) Canvas/WebGL (Опциональный)

**Когда использовать:**
- Нужна супер плавная анимация при >1000 карточках
- Сложные визуальные эффекты (particles, connections)
- Параллакс эффекты

**Технологии:**
- Three.js или Pixi.js для рендеринга
- Offscreen canvas для фонового рендеринга
- WebGL шейдеры для эффектов

**Hybrid подход (MVP):**

```tsx
function TimeRulerHybrid({ notes }: TimeRulerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Canvas для линии и эффектов
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    
    function renderTrack() {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      
      // Рисуем линию
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, ctx.canvas.height / 2);
      ctx.lineTo(ctx.canvas.width, ctx.canvas.height / 2);
      ctx.stroke();
      
      // Рисуем метки
      ticks.forEach(tick => {
        const x = yearToPixel(tick.year);
        const y = ctx.canvas.height / 2;
        const height = tick.isMajor ? 20 : 10;
        
        ctx.beginPath();
        ctx.moveTo(x, y - height / 2);
        ctx.lineTo(x, y + height / 2);
        ctx.stroke();
      });
      
      requestAnimationFrame(renderTrack);
    }
    
    renderTrack();
  }, [currentPosition, zoomLevel]);
  
  return (
    <div className="time-ruler-hybrid">
      <canvas
        ref={canvasRef}
        className="timeline-canvas"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      />
      <div className="timeline-cards-dom">
        {/* DOM карточки поверх canvas */}
        {visibleNotes.map(note => (
          <TimelineCard key={note.id} note={note} />
        ))}
      </div>
    </div>
  );
}
```

---

## 6. Производительность

### Оптимизации:

1. **Виртуализация:**
   - Рендерим только видимые карточки + buffer
   - Используем `React.memo` для карточек
   - Мемоизация фильтров и сортировки

2. **Throttling/Debouncing:**
   - Скролл события throttle до 16ms (60fps)
   - Фильтры debounce 300ms

3. **RequestAnimationFrame:**
   - Все анимации через RAF
   - Batch updates

4. **CSS Will-Change:**
   - Только на активно анимируемых элементах
   - Удаляем после анимации

5. **Lazy Loading:**
   - Изображения загружаются по мере приближения
   - `IntersectionObserver` для trigger

```typescript
// Throttle для скролла
function useThrottledScroll(callback: (e: WheelEvent) => void, delay: number) {
  const lastRun = useRef(Date.now());
  
  return useCallback((e: WheelEvent) => {
    const now = Date.now();
    if (now - lastRun.current >= delay) {
      callback(e);
      lastRun.current = now;
    }
  }, [callback, delay]);
}

// Мемоизация фильтрации
const filteredNotes = useMemo(() => {
  return notes
    .filter(note => applyFilters(note, filters))
    .filter(note => filterByLOD(note, zoomLevel));
}, [notes, filters, zoomLevel]);
```

---

## 7. URL State Management

```typescript
// Синхронизация с URL
function useTimelineURLState() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const currentYear = useMemo(
    () => parseInt(searchParams.get('year') || '1900', 10),
    [searchParams]
  );
  
  const zoomLevel = useMemo(
    () => (searchParams.get('zoom') || 'mid') as 'out' | 'mid' | 'in',
    [searchParams]
  );
  
  const filters = useMemo(() => ({
    types: searchParams.get('types')?.split(',') || [],
    domains: searchParams.get('domains')?.split(',') || [],
  }), [searchParams]);
  
  const updateYear = useCallback((year: number) => {
    setSearchParams(prev => {
      prev.set('year', year.toString());
      return prev;
    });
  }, [setSearchParams]);
  
  return {
    currentYear,
    zoomLevel,
    filters,
    updateYear,
    // ... другие методы
  };
}

// Использование
function TimeRuler() {
  const { currentYear, updateYear, zoomLevel } = useTimelineURLState();
  
  // URL обновляется при скролле (debounced)
  const debouncedUpdateYear = useDebouncedCallback(updateYear, 500);
  
  useEffect(() => {
    debouncedUpdateYear(currentPosition);
  }, [currentPosition]);
  
  // ...
}
```

---

## 8. Итоговая Рекомендация

**MVP (Фаза 1):**
1. Реализация A (CSS/DOM + виртуализация)
2. Горизонтальная ориентация
3. 3 уровня LOD
4. Базовые фильтры (type, domain)
5. Snap к эпохам
6. Mini-map

**Фаза 2:**
1. Focus mode
2. Связи между карточками (hover highlighting)
3. Вертикальная ориентация (опция)
4. Расширенные фильтры
5. Параллакс эффекты

**Фаза 3:**
1. Canvas/WebGL для эффектов
2. Анимированные переходы между эпохами
3. 3D карточки (опционально)
4. Экспорт таймлайна в PDF/изображение

---

## Приложение: Пример Полного Компонента

```tsx
// src/components/museum/TimeRuler/index.tsx
import { useState, useRef, useMemo, useCallback } from 'react';
import { useArcheStore } from '@/arche/state/store';
import { TimelineFilters } from './TimelineFilters';
import { TimelineTrack } from './TimelineTrack';
import { TimelineCards } from './TimelineCards';
import { TimelineMiniMap } from './TimelineMiniMap';
import { ScrollController } from './ScrollController';
import { enrichNoteWithTimeline } from './utils';

export function TimeRuler() {
  const notes = useArcheStore(state => state.notes);
  const [currentPosition, setCurrentPosition] = useState(1900);
  const [zoomLevel, setZoomLevel] = useState<'out' | 'mid' | 'in'>('mid');
  const [filters, setFilters] = useState<FilterState>({
    types: [],
    domains: [],
    statuses: [],
  });
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null);
  
  // Обогащаем заметки временными данными
  const timelineNotes = useMemo(
    () => notes.map(enrichNoteWithTimeline).filter(n => n.timeline),
    [notes]
  );
  
  // Фильтрация
  const filteredNotes = useMemo(() => {
    return timelineNotes
      .filter(note => applyFilters(note, filters))
      .filter(note => filterByLOD(note, zoomLevel));
  }, [timelineNotes, filters, zoomLevel]);
  
  // Snap points
  const snapPoints = useMemo(
    () => generateSnapPoints(filteredNotes),
    [filteredNotes]
  );
  
  // Scroll controller
  const scrollController = useMemo(
    () => new ScrollController(setCurrentPosition, {
      enabled: true,
      threshold: 5,
      strength: 0.7,
    }, snapPoints),
    [snapPoints]
  );
  
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    scrollController.handleWheel(e.deltaY);
  }, [scrollController]);
  
  return (
    <div className="time-ruler h-screen flex flex-col bg-background">
      <TimelineFilters
        filters={filters}
        onFiltersChange={setFilters}
        zoomLevel={zoomLevel}
        onZoomChange={setZoomLevel}
      />
      
      <div
        className="flex-1 relative overflow-hidden"
        onWheel={handleWheel}
      >
        <TimelineTrack
          startYear={-500}
          endYear={2025}
          currentPosition={currentPosition}
          zoomLevel={zoomLevel}
        />
        
        <TimelineCards
          notes={filteredNotes}
          currentPosition={currentPosition}
          zoomLevel={zoomLevel}
          focusedNoteId={focusedNoteId}
          onCardClick={setFocusedNoteId}
        />
      </div>
      
      <TimelineMiniMap
        startYear={-500}
        endYear={2025}
        currentPosition={currentPosition}
        onPositionChange={setCurrentPosition}
      />
    </div>
  );
}
```

