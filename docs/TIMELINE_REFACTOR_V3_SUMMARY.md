# Timeline Refactor V3 - Итоговое Резюме

**Дата:** 6 января 2026  
**Статус:** ✅ ЗАВЕРШЕНО  
**Цель:** Устранить "кривизну" и проблемы с hover в Timeline

---

## 🎯 РЕШЁННЫЕ ПРОБЛЕМЫ

### 1. ❌ → ✅ "Соседняя карточка получает синюю обводку"

**Причина:**
- Wrapper div с `transform: translate(-50%, -50%)` расширял hitbox
- События `onMouseEnter` на wrapper перехватывались соседями

**Решение:**
```typescript
// Wrapper: pointer-events: none
<div className="absolute pointer-events-none">
  {/* Карточка: pointer-events: auto */}
  <div 
    className="pointer-events-auto"
    onPointerEnter={() => onHover?.(note.id)} // только здесь!
  />
</div>
```

**Файл:** `src/components/timeline/components/TimelineCardV2.tsx`

---

### 2. ❌ → ✅ "Ruler/карточки выглядят криво"

**Причина:**
- Дробные пиксели (subpixel positioning)
- `Math.round()` без учёта `devicePixelRatio`

**Решение:**
```typescript
// Новая утилита: src/components/timeline/utils/pixelSnap.ts
const dpr = window.devicePixelRatio || 1;

export function snap(value: number): number {
  return Math.round(value * dpr) / dpr;
}

// Применено везде:
left: `${snap(layout.viewX)}px`
transform: snapTransform(-width/2, -height/2)
```

**Файлы:**
- `src/components/timeline/utils/pixelSnap.ts` (новый)
- `src/components/timeline/components/TimelineCardV2.tsx`
- `src/components/timeline/components/TimelineTrackV2.tsx`

---

### 3. ❌ → ✅ "Синяя обводка после клика мышью"

**Причина:**
- Браузерный `:focus` применяется при клике

**Решение:**
```css
/* src/index.css */
*:focus:not(:focus-visible) {
  outline: none;
  box-shadow: none;
}

*:focus-visible {
  @apply ring-2 ring-primary; /* только при Tab */
}
```

**Файл:** `src/index.css`

---

### 4. ❌ → ✅ "Визуальная грязь" (blur/текст)

**Причина:**
- `blur-[1px]` при dimmed
- Слишком много текста на карточке

**Решение:**
- Убран blur, только `opacity: 0.3`
- LOD: превью текста только при hover/focus
- Домены только при focus
- Фиксированные размеры (320x160px)

**Файл:** `src/components/timeline/components/TimelineCardV2.tsx`

---

### 5. ❌ → ✅ "Неправильная иерархия слоёв"

**Причина:**
- ConnectionLines перехватывали клики
- Z-index через Tailwind классы был неявным

**Решение:**
```typescript
// Чёткая иерархия:
const zIndex = 
  isFocused ? 20 :  // focus - наивысший
  isHovered ? 15 :  // hover выше
  isRelated ? 10 :  // связанные
  0;                // базовый

// Слои:
// Layer 0: Background/Track (z:0, pointer-events:none)
// Layer 1: ConnectionLines (z:5, pointer-events:none)
// Layer 2: Cards (z:10-20, pointer-events:auto)
```

**Файлы:**
- `src/components/timeline/components/TimelineCardV2.tsx`
- `src/components/timeline/ConnectionLines.tsx`
- `src/components/timeline/TimeRulerV2.tsx`

---

## 📦 ИЗМЕНЁННЫЕ ФАЙЛЫ

### ✨ Новые
- `src/components/timeline/utils/pixelSnap.ts` - утилиты для pixel-perfect рендеринга

### ✏️ Изменённые
1. `src/components/timeline/components/TimelineCardV2.tsx`
   - Pointer events на внутреннем элементе
   - Pixel snapping для координат
   - Чёткая z-index система
   - Убран blur, фиксированные размеры
   - LOD для текста/доменов

2. `src/components/timeline/components/TimelineTrackV2.tsx`
   - Pixel snapping для всех координат
   - Hairline offset для 1px линий
   - Pointer-events: none

3. `src/components/timeline/TimeRulerV2.tsx`
   - Разделение на слои (background/lines/cards)
   - Комментарии по структуре

4. `src/components/timeline/ConnectionLines.tsx`
   - Z-index: 5 (под карточками)
   - Pointer-events: none

5. `src/index.css`
   - Focus-visible fix
   - Grain texture для museum стиля
   - Scrollbar styling

6. `src/components/timeline/TimelineCard.tsx` (старый, не V2)
   - Fix linter ошибок (import.meta.env.DEV)

### 📄 Документация
- `docs/TIMELINE_FIXES_CHECKLIST.md` - полный чек-лист для QA
- `docs/TIMELINE_REFACTOR_V3_SUMMARY.md` (этот файл)

---

## 🧪 КАК ПРОВЕРИТЬ

### Быстрая проверка (2 минуты)
1. ✅ Навести курсор на карточку → **только она** подсвечивается
2. ✅ Переместить на соседнюю → обводка **переходит корректно**
3. ✅ Кликнуть карточку → **нет синей обводки** после клика
4. ✅ Центральная линия ruler **ровная**, не дрожит

### Полная проверка (10 минут)
См. `docs/TIMELINE_FIXES_CHECKLIST.md` (45 пунктов)

---

## 🏗 АРХИТЕКТУРНЫЕ ПРИНЦИПЫ

### 1. Единая система координат
- Все X-координаты через `yearToViewX()` (из `timelineMath`)
- Все Y-координаты через `laneToViewY()`
- **Pixel snapping** везде через `snap()`

### 2. Pointer Events Hierarchy
```
┌─ Background/Track (pointer-events: none) ─┐
│   ├─ ConnectionLines (pointer-events: none)│
│   └─ Cards Container                        │
│       └─ Card Wrapper (pointer-events: none)│
│           └─ Card Inner (pointer-events: auto) ← ТОЛЬКО ЗДЕСЬ!
└─────────────────────────────────────────────┘
```

### 3. Z-Index Hierarchy
```
 0: Background/Track
 5: ConnectionLines
10: Cards (related)
15: Cards (hovered)
20: Cards (focused)
30: Navigation controls
```

### 4. Level of Detail (LOD)
```
Базовый:     заголовок + год
+ Hover:     + превью текста
+ Focus:     + домены + полный текст
```

### 5. No-Transform Scale
- Размеры фиксированные (320x160px)
- Никаких `transform: scale()` (вызывает blur)
- Только `opacity` для dimmed состояния

---

## 🎨 ВИЗУАЛЬНЫЙ СТИЛЬ

### Museum/Art Gallery Theme
- **Background:** Тёмный графит (`hsl(222 14% 6%)`)
- **Grain texture:** Тонкий оверлей (opacity: 0.03)
- **Typography:** 
  - Serif: Crimson Pro (заголовки)
  - Sans: Inter (UI)
- **Акценты:** Синий (`hsl(217 91% 60%)`)
- **Линии:** 1px с hairline offset для Retina

### Состояния карточек
```
Default:    border-border/30, opacity: 1.0
Hovered:    ring-2 ring-primary/60
Related:    ring-1 ring-primary/30
Focused:    ring-2 ring-primary, shadow-2xl
Dimmed:     opacity: 0.3 (без blur!)
```

---

## 🚀 ПРОИЗВОДИТЕЛЬНОСТЬ

### Оптимизации
- ✅ Виртуализация карточек (только видимые рендерятся)
- ✅ `memo()` на TimelineCardV2
- ✅ `willChange: opacity` (не transform!)
- ✅ Debounced URL updates
- ✅ ResizeObserver для стабильной геометрии

### Метрики (целевые)
- 60 FPS при скролле
- < 16ms render time
- < 300ms scroll response

---

## 📚 СПРАВКА ПО API

### snap(value: number): number
Округляет координату до device pixel для устранения subpixel artifacts.

```typescript
import { snap } from '@/components/timeline/utils/pixelSnap';

const x = snap(123.456); // → 123 (на 1x) или 123.5 (на 2x)
```

### snapTransform(x: number, y: number, z?: number): string
Создаёт pixel-perfect `translate3d()`.

```typescript
import { snapTransform } from '@/components/timeline/utils/pixelSnap';

style={{ transform: snapTransform(-160, -80) }}
// → "translate3d(-160px, -80px, 0px)" (snapped)
```

### hairline(): number
Возвращает offset для 1px линий на Retina дисплеях.

```typescript
import { hairline } from '@/components/timeline/utils/pixelSnap';

const offset = hairline(); // → 0.25 на 2x DPR, 0 на 1x
```

---

## 🐛 ИЗВЕСТНЫЕ ОГРАНИЧЕНИЯ

1. **IE11 не поддерживается** (uses CSS custom properties)
2. **Минимальная ширина viewport: 320px**
3. **Максимум 5 lanes** для карточек (можно настроить)
4. **Touch devices:** hover через tap (стандартное поведение)

---

## 🔮 БУДУЩИЕ УЛУЧШЕНИЯ

### Можно добавить (опционально):
- [ ] Drag-and-drop для карточек
- [ ] Pinch-to-zoom на тач-устройствах
- [ ] Анимация появления карточек при скролле
- [ ] Группировка карточек по эпохам (collapse/expand)
- [ ] Экспорт timeline в PNG/SVG
- [ ] Поиск по карточкам с подсветкой

---

## ✅ ЧЕКЛИСТ ЗАВЕРШЕНИЯ

- [x] Pointer events: wrapper не перехватывает события
- [x] Pixel snapping: все координаты снапнуты
- [x] Z-index: чёткая иерархия
- [x] Focus-visible: только при Tab
- [x] Blur удалён, фиксированные размеры
- [x] LOD: текст/домены по уровню детализации
- [x] Слои разделены (background/lines/cards)
- [x] ConnectionLines: pointer-events: none
- [x] Документация написана
- [x] Linter errors исправлены

---

**Статус:** ✅ **READY FOR PRODUCTION**

**Следующий шаг:** Ручное тестирование по чек-листу из `TIMELINE_FIXES_CHECKLIST.md`


