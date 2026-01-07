# ✅ Доработка Timeline: Semantic Rows + Progressive Disclosure

## 📋 Выполненные исправления

### ✅ 1. Создан `constants.ts` с централизованными константами
**Файл:** `src/components/timeline/constants.ts` (новый)

Все константы вынесены в один файл:
- `CARD_WIDTH = 320`, `CARD_HEIGHT = 160`
- `CARD_GAP = 20`, `CARD_BOTTOM_MARGIN = 20`, `CARD_HORIZONTAL_GAP = 10`
- `ROW_HEADER_WIDTH = 140`
- `DEFAULT_ROW_HEIGHT = 220`, `MIN_ROW_HEIGHT = 140`, `MAX_ROW_HEIGHT = 220`
- `TRACK_AREA_HEIGHT = 120`
- `MARKER_HEIGHT = 4`, `MARKER_BOTTOM_MARGIN = 2`

**Использование:** Все компоненты обновлены для использования констант из `constants.ts`

---

### ✅ 2. RowsArea: Scrollable контейнер + компактный layout
**Файл:** `src/components/timeline/components/RowsLayer.tsx`

**Проблема:** Строки "размазаны" по пустоте, "Заметки" выглядели "упавшими вниз"

**Решение:**
- RowsArea теперь scrollable контейнер с фиксированной высотой `geometry.cardsAreaHeight`
- Внутренний контейнер со всеми строками имеет `minHeight = totalHeight`
- Если строк мало → компактный режим: `rowHeight = clamp(MIN_ROW_HEIGHT, cardsAreaHeight / rowsCount)`
- Если строк много → появляется вертикальный scroll (`overflow-y: auto`)

**Результат:** Строки идут последовательно, "Заметки" просто последняя строка в списке

---

### ✅ 3. Счетчики в RowHeader (total + inFocus)
**Файл:** `src/components/timeline/components/Row.tsx`

**Добавлено:**
- В заголовке строки показывается: `{label} {totalCount} ({inFocusCount} в фокусе)`
- Если `inFocusCount < totalCount` → показывается подсказка "🔍 zoom in"
- Счетчики обновляются при изменении `scrollYear` и `zoomLevel`

**Результат:** Пользователь всегда видит, сколько заметок в строке и сколько видно в фокусе

---

### ✅ 4. CSS overflow и убрано двойное позиционирование
**Файлы:** 
- `src/components/timeline/components/RowCardsLayer.tsx`
- `src/components/timeline/components/TimelineCard.tsx`
- `src/components/timeline/components/Row.tsx`

**Исправления:**
- `Row`: `overflow-visible` на контейнере строки
- `RowCardsLayer`: `overflow-visible` на wrapper, позиционирование ТОЛЬКО через wrapper `div` с `left/top`
- `TimelineCard`: убрано внутреннее `absolute` позиционирование, только размеры и стили
- Wrapper `div` в `RowCardsLayer` задает `width` и `height` для карточки

**Результат:** Карточки не обрезаются, нет двойного позиционирования

---

### ✅ 5. FocusWindow: зависимость от `yearsPerScreen`
**Файл:** `src/components/timeline/utils/focusWindow.ts`

**Изменения:**
- `getFocusWindowYears(zoomLevel, geometry?)` теперь принимает `geometry`
- Если `geometry` передан → `focusWindowYears = max(baseByZoom, yearsPerScreen * 1.2)`
- `isInFocusWindow` и `getFocusWindowBounds` также принимают `geometry`

**Результат:** При любом масштабе пользователь видит хотя бы "плотный" участок вокруг центра

**Обновлено использование:**
- `Row.tsx`: передает `geometry` в `isInFocusWindow`
- `RowCardsLayer.tsx`: передает `geometry` в `isInFocusWindow`

---

### ✅ 6. Audit grouping: проверка что все notes попадают в rows
**Файл:** `src/components/timeline/utils/rowTypes.ts`

**Добавлено:**
- После группировки проверяется: `sum(lengths) === notes.length`
- Если mismatch → `console.warn` с деталями
- Если есть unmapped типы → `console.warn` с перечислением типов
- Fallback: нераспознанные типы идут в `'note'` row

**Результат:** Все заметки гарантированно попадают в строки, ошибки логируются

---

### ✅ 7. Удален мертвый код
**Удалены файлы:**
- `src/components/timeline/components/CardLayer.tsx`
- `src/components/timeline/hooks/useGreedyLayout.ts`
- `src/components/timeline/core/greedyLayout.ts`

**Созданы deprecated файлы (для справки):**
- `src/components/timeline/components/CardLayer.tsx.deprecated`
- `src/components/timeline/hooks/useGreedyLayout.ts.deprecated`
- `src/components/timeline/core/greedyLayout.ts.deprecated`

**Результат:** Код очищен от неиспользуемых компонентов

---

### ✅ 8. Bucket layout: защита от горизонтальных overlaps
**Файл:** `src/components/timeline/components/RowCardsLayer.tsx`

**Добавлено:**
- После вычисления позиций карточек → сортировка по X (слева направо)
- Проверка минимального расстояния: `minDistance = CARD_WIDTH + CARD_HORIZONTAL_GAP`
- Если `actualDistance < minDistance` → сдвигаем карточку вправо

**Результат:** Карточки не перекрываются горизонтально

---

### ✅ 9. Overflow indicators: интерактивные
**Файл:** `src/components/timeline/components/RowCardsLayer.tsx`

**Добавлено:**
- State `expandedBuckets: Set<number>` для отслеживания расширенных buckets
- `computeBucketLayout` принимает `expandedBuckets?: Set<number>`
- Если bucket расширен → показываются все карточки (без ограничения `maxStackPerBucket`)
- Overflow indicator теперь `pointer-events-auto` с обработчиком клика
- При клике → bucket добавляется/удаляется из `expandedBuckets`
- Стили: `hover:scale-105`, `cursor-pointer`, tooltip с подсказкой

**Результат:** Пользователь может кликнуть "+N" чтобы увидеть все карточки в bucket

---

### ✅ 10. Улучшены маркеры плотности
**Файл:** `src/components/timeline/components/RowMarkersLayer.tsx`

**Изменения:**
- Используются константы `MARKER_HEIGHT`, `MARKER_BOTTOM_MARGIN`
- Маркеры более заметные: `opacity: 0.4-0.8` (было 0.2-0.6)
- Высота маркеров: `4-6px` (было 2-4px)
- Увеличен буфер для видимого диапазона: `0.5` (было `0.2`)
- `overflow-visible` на контейнере

**Результат:** Маркеры всегда видны для всех заметок, пользователь понимает наличие данных

---

## 📁 Измененные файлы

### Новые файлы:
1. `src/components/timeline/constants.ts` - централизованные константы

### Измененные файлы:
1. `src/components/timeline/utils/focusWindow.ts` - зависимость от `yearsPerScreen`
2. `src/components/timeline/utils/rowTypes.ts` - audit grouping
3. `src/components/timeline/utils/bucketLayout.ts` - поддержка `expandedBuckets`
4. `src/components/timeline/components/RowMarkersLayer.tsx` - улучшенные маркеры
5. `src/components/timeline/components/RowCardsLayer.tsx` - защита от overlaps, интерактивные overflow
6. `src/components/timeline/components/Row.tsx` - счетчики в заголовке
7. `src/components/timeline/components/RowsLayer.tsx` - scrollable контейнер
8. `src/components/timeline/components/TimelineCard.tsx` - убрано двойное позиционирование
9. `src/components/timeline/core/projection.ts` - использование констант

### Удаленные файлы:
1. `src/components/timeline/components/CardLayer.tsx`
2. `src/components/timeline/hooks/useGreedyLayout.ts`
3. `src/components/timeline/core/greedyLayout.ts`

### Deprecated файлы (для справки):
1. `src/components/timeline/components/CardLayer.tsx.deprecated`
2. `src/components/timeline/hooks/useGreedyLayout.ts.deprecated`
3. `src/components/timeline/core/greedyLayout.ts.deprecated`

---

## 🎯 Результаты

### ✅ Решенные проблемы:

1. **"Заметки" не выглядят "упавшими"**
   - RowsArea теперь scrollable контейнер
   - Компактный layout для малого количества строк
   - Строки идут последовательно

2. **Все карточки видны (в focus window)**
   - Исправлен CSS overflow
   - Убрано двойное позиционирование
   - Карточки не обрезаются

3. **Пользователь понимает наличие данных**
   - Маркеры всегда видны для всех заметок
   - Счетчики в заголовках строк (total + inFocus)
   - Подсказка "zoom in" если есть скрытые карточки

4. **Focus window адаптивный**
   - Учитывает `yearsPerScreen`
   - Минимум 1.2x от видимого диапазона

5. **Код очищен**
   - Удален мертвый код
   - Константы централизованы
   - Audit grouping проверяет корректность

6. **UX улучшен**
   - Интерактивные overflow indicators
   - Защита от горизонтальных overlaps
   - Более заметные маркеры

---

## 🧪 Проверка

✅ Сборка проходит успешно: `pnpm run build` (exit code: 0)
✅ Нет ошибок линтера
✅ TypeScript strict mode

---

## 📝 Примечания

- Все изменения сохраняют концепцию Semantic Rows + Progressive Disclosure
- Geometry/Camera separation не нарушена
- Обратная совместимость сохранена (legacy layout для TimelineCard)
- Deprecated файлы оставлены для справки, но не импортируются

