# Ревью: Интеграция Pixi.js + Matter.js графа

## Статус: ❌ КРИТИЧЕСКИЕ ОШИБКИ - Frontend не собирается

## Основные проблемы

### 1. ❌ КРИТИЧНО: `@pixi/react` не экспортирует `Stage` и `useApp`
**Файл:** `src/components/graph-pixi/GraphCanvas.tsx:2`
```typescript
import { Stage, useApp } from '@pixi/react'; // ❌ Ошибка TS2305
```

**Проблема:** В версии `@pixi/react@8.0.5` API изменился. Нужно проверить документацию и использовать правильные экспорты.

**Решение:** 
- Проверить документацию `@pixi/react` v8
- Возможно использовать `@pixi/react` v7 или другой подход
- Или создать Stage напрямую через PIXI.Application

### 2. ❌ КРИТИЧНО: Несовместимость типов Viewport.addChild
**Файл:** `src/components/graph-pixi/GraphContent.tsx:55-66`
```typescript
viewport.addChild(linesContainer); // ❌ TS2345
```

**Проблема:** `Viewport.addChild()` ожидает `DisplayObject`, но получает `Container<ContainerChild>`.

**Решение:** 
- Проверить типы pixi-viewport
- Возможно нужен каст `as any` или правильный тип
- Или использовать другой метод добавления

### 3. ⚠️ Ошибка типа: `strokeThickness` не существует в TextStyle
**Файл:** `src/components/graph-pixi/Node.tsx:239`
```typescript
strokeThickness: 2, // ❌ TS2353
```

**Проблема:** В PIXI v8 `strokeThickness` переименован или удалён.

**Решение:** Использовать правильное свойство (возможно `stroke.width` или другое)

### 4. ⚠️ Неиспользуемые импорты
- `GraphCanvas.tsx`: `PIXI`, `Node`, `Line`, `GraphNodeContainer` не используются
- `GraphContent.tsx`: `Node` не используется
- `GraphNodeContainer.tsx`: `useCallback`, `Matter` не используются
- `Line.tsx`: `edge` не используется

## Архитектурные проблемы

### 1. Смешанный подход к созданию PIXI объектов
- Часть компонентов пытается использовать React-компоненты из `@pixi/react`
- Часть создаёт PIXI объекты напрямую через `useEffect`
- Нет единообразия

### 2. Проблемы с жизненным циклом
- Контейнеры создаются в `GraphContent`, но компоненты `Line` и `Node` тоже создают свои контейнеры
- Возможны утечки памяти при unmount

### 3. Неправильная работа с Viewport
- `ViewportSetup` создаёт viewport, но не добавляет его в Stage правильно
- Нужно использовать правильный API для интеграции viewport с Stage

## Что работает

✅ Структура файлов создана правильно:
- `types.ts` - типы
- `buildGraphData.ts` - адаптер данных
- `physics.ts` - Matter.js физика
- `Node.tsx`, `Line.tsx` - компоненты рендеринга
- `GraphCanvas.tsx` - основной компонент

✅ Зависимости установлены:
- `pixi.js@8.14.3`
- `@pixi/react@8.0.5`
- `matter-js@0.19.0`
- `pixi-viewport@5.1.0`
- Совместимые версии `@pixi/math`, `@pixi/display`, `@pixi/ticker@6.5.10`

## Рекомендации по исправлению

### Вариант 1: Исправить текущий подход
1. Проверить документацию `@pixi/react` v8 и использовать правильные экспорты
2. Исправить типы для Viewport
3. Исправить `strokeThickness` → правильное свойство
4. Удалить неиспользуемые импорты

### Вариант 2: Упростить подход (рекомендуется)
1. **Отказаться от `@pixi/react`** - создавать всё напрямую через PIXI
2. Использовать `useEffect` для создания `PIXI.Application` и добавления в DOM
3. Управлять всеми объектами через refs и прямые вызовы PIXI API
4. Это даст больше контроля и избежит проблем с версиями

### Вариант 3: Откатиться на стабильную версию
1. Использовать `@pixi/react@7.x` (совместим с React 18)
2. Использовать `pixi.js@7.x`
3. Использовать `pixi-viewport@4.x`

## Следующие шаги

1. **Немедленно:** Исправить импорты `Stage` и `useApp`
2. **Критично:** Исправить типы Viewport
3. **Важно:** Исправить `strokeThickness`
4. **Очистка:** Удалить неиспользуемые импорты
5. **Тестирование:** Проверить что граф рендерится

## Файлы для проверки

- `src/components/graph-pixi/GraphCanvas.tsx` - основной компонент
- `src/components/graph-pixi/GraphContent.tsx` - управление контейнерами
- `src/components/graph-pixi/Node.tsx` - рендеринг нод
- `src/components/graph-pixi/Line.tsx` - рендеринг линий
- `src/components/graph-pixi/GraphNodeContainer.tsx` - интерактивность нод

## Дополнительные проблемы (не критичные)

- Ошибки в `src/components/ui/calendar.tsx` и `chart.tsx` - не связаны с графом
- Неиспользуемые импорты в `src/arche/state/store.ts` - не критично


