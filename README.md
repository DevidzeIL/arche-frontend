# Arche — Философская База Знаний

**Museum-Style UI + Interactive Timeline + Knowledge Graph**

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![React](https://img.shields.io/badge/react-19.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 🎯 Что Это?

**Arche** — интерактивное приложение для исследования философских концепций, персон и работ через:
- 🕰️ **Timeline** — хронологическая визуализация с Focus Mode
- 🌐 **Graph** — граф связей между заметками (Matter.js + Pixi.js)
- 📝 **Notes** — Markdown заметки с wikilinks
- 🎨 **Museum UI** — тёмная элегантная тема

---

## ✨ Ключевые Фичи

### 🕰️ Time Ruler

**Интерактивная временная линейка:**
- Плавный scroll с инерцией
- Snap к значимым точкам (персоны, работы, эпохи)
- 3 уровня LOD (out/mid/in)
- Focus Mode с затемнением
- SVG линии связей
- Hover highlights
- Фильтры: типы + домены
- URL state sync
- Keyboard shortcuts

[Подробнее в TIME_RULER_USAGE.md](docs/TIME_RULER_USAGE.md)

### 🌐 Knowledge Graph

**Физическая визуализация связей:**
- Matter.js физика (гравитация, отталкивание)
- Pixi.js рендеринг (60fps)
- Anchor forces (time-axis, hubs)
- Hover/select highlights
- Canvas-based для производительности

### 🎨 Museum Design

**Элегантный UI:**
- Черный/графит палитра (oklch)
- Serif типографика (Georgia)
- Grain texture
- Тонкие линии
- Минимальные акценты

---

## 🚀 Быстрый Старт

### Требования

- Node.js 18+
- pnpm (рекомендуется)

### Установка

```bash
# Клонировать
git clone https://github.com/your-username/arche.git
cd arche

# Установить зависимости
pnpm install

# Запустить dev server
pnpm dev
```

**Откройте:** http://localhost:5173

### Структура

```
arche/
├── arche-vault/          # Markdown заметки
│   ├── 00_HUB/           # Хабы
│   ├── 01_Time/          # Эпохи
│   ├── 02_Persons/       # Персоны
│   ├── 03_Concepts/      # Концепции
│   ├── 04_Works/         # Работы
│   └── _imgs/            # Изображения
├── src/
│   ├── components/
│   │   ├── museum/       # Museum компоненты
│   │   └── timeline/     # Time Ruler
│   ├── pages/            # React Router страницы
│   └── arche/            # Core логика
└── docs/                 # Документация
```

---

## 📖 Документация

### Руководства

- **[TIME_RULER_USAGE.md](docs/TIME_RULER_USAGE.md)** — использование Time Ruler
- **[FOCUS_MODE_GUIDE.md](docs/FOCUS_MODE_GUIDE.md)** — Focus Mode и интерактивность
- **[TIME_RULER_DESIGN.md](docs/TIME_RULER_DESIGN.md)** — архитектура и дизайн
- **[REDESIGN_IMPLEMENTATION.md](docs/REDESIGN_IMPLEMENTATION.md)** — гайд по редизайну
- **[PROJECT_SUMMARY.md](docs/PROJECT_SUMMARY.md)** — общий обзор

---

## 🎮 Использование

### Timeline

**Навигация:**
- Колёсико мыши — scroll по временной оси
- Клик на карточку — Focus Mode
- Escape — выход из Focus Mode
- Мини-карта — быстрый переход к году

**Фильтры:**
- Типы: hub/time/concept/person/work/place/event/note
- Домены: philosophy/art/literature/science/history/psychology
- Zoom: out (века) / mid (десятилетия) / in (годы)

**Focus Mode:**
- Клик → карточка центрируется и увеличивается
- Связанные заметки подсвечиваются
- SVG линии показывают связи
- Остальные карточки затемняются
- Hover на другую карточку → preview связей

### Graph

**Навигация:**
- Pan — drag фона
- Zoom — колёсико мыши
- Клик на ноду — выбрать (highlight соседей)
- Hover — preview связей

### Notes

**Просмотр:**
- Markdown рендеринг с syntax highlighting
- Wikilinks `[[название]]` → кликабельные ссылки
- Изображения из `_imgs/`
- Связанные заметки (incoming/outgoing)

---

## 🛠️ Технологии

```json
{
  "frontend": {
    "react": "^19.0.0",
    "react-router-dom": "^7.11.0",
    "tailwindcss": "^3.4.19",
    "shadcn/ui": "latest"
  },
  "visualization": {
    "pixi.js": "^8.14.3",
    "@pixi/react": "^8.0.5",
    "matter-js": "^0.20.0"
  },
  "content": {
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1"
  },
  "state": {
    "zustand": "^5.0.9"
  },
  "build": {
    "vite": "^6.0.11",
    "typescript": "^5.7.3"
  }
}
```

---

## 📝 Добавление Контента

### Создание Заметки

```markdown
---
id: person-plato-001
type: person
status: mature
domain:
  - philosophy
tags:
  - ancient-greece
  - idealism
---

# Платон

**428-348 до н.э.** — древнегреческий философ.

Ученик [[Сократ|Сократа]], учитель [[Аристотель|Аристотеля]].

## Основные работы

- [[Государство]]
- [[Федон]]
- [[Пир]]

## Ключевые идеи

Платон разработал [[Теория идей|теорию идей]]...
```

**Поля:**
- `id` — уникальный ID
- `type` — person/concept/work/time/place/event/note/hub
- `status` — seedling/sapling/mature/evergreen
- `domain` — философия, искусство, литература, наука...
- `tags` — произвольные теги

**Timeline:**
Даты автоматически извлекаются из текста:
- `"428-348 до н.э."` → startYear: -428, endYear: -348
- `"1900"` → startYear: 1900
- `"5 век до н.э."` → примерно -450

### Добавление Изображений

```markdown
![Описание](Pasted image 20260103222929.png)

или Obsidian-style:

![[Pasted image 20260103222929.png]]
```

Поместите изображение в `arche-vault/_imgs/`

---

## 🎨 Кастомизация

### Изменение Темы

`src/index.css`:

```css
:root {
  --background: oklch(0.08 0 0); /* Чёрный */
  --foreground: oklch(0.95 0 0); /* Светлый текст */
  /* ... */
}
```

### Настройка Time Ruler

`src/components/timeline/TimeRuler.tsx`:

```typescript
const DEFAULT_EPOCHS = [
  { name: 'Античность', startYear: -800, endYear: 500 },
  // ... добавить свои эпохи
];

const START_YEAR = -800;
const END_YEAR = 2025;
```

### Snap Параметры

```typescript
const controller = new ScrollController(
  setCurrentPosition,
  {
    enabled: true,
    threshold: 10,  // годы
    strength: 0.7,  // 0-1
  },
  snapPoints
);
```

---

## 🧪 Разработка

### Команды

```bash
pnpm dev          # Dev server (localhost:5173)
pnpm build        # Production build
pnpm preview      # Preview build
pnpm lint         # ESLint
pnpm type-check   # TypeScript check
```

### Структура Компонентов

```
src/
├── components/
│   ├── museum/
│   │   ├── GrainBackground.tsx
│   │   ├── MuseumCard.tsx
│   │   ├── MuseumLayout.tsx
│   │   ├── MuseumNavigation.tsx
│   │   └── TypeBadge.tsx
│   │
│   ├── timeline/
│   │   ├── TimeRuler.tsx
│   │   ├── TimelineFilters.tsx
│   │   ├── TimelineTrack.tsx
│   │   ├── TimelineCard.tsx
│   │   ├── TimelineMiniMap.tsx
│   │   ├── ConnectionLines.tsx
│   │   ├── ScrollController.ts
│   │   └── utils/
│   │
│   └── ui/                # shadcn/ui
│
├── pages/
│   ├── HomePage.tsx
│   ├── TimelinePage.tsx
│   ├── NotePage.tsx
│   └── GraphPage.tsx
│
├── layouts/
│   └── RootLayout.tsx
│
├── routes/
│   └── index.tsx
│
└── arche/
    ├── graph/             # Pixi.js Graph
    ├── markdown/          # Markdown рендеринг
    ├── parser/            # Парсер заметок
    └── state/             # Zustand store
```

---

## 🔧 Troubleshooting

### Проблема: Заметки не появляются на Timeline

**Причина:** Нет дат в контенте

**Решение:**
1. Добавьте даты в markdown: `"384-322 до н.э."`
2. Или добавьте frontmatter:
```yaml
timeline:
  start_year: -384
  end_year: -322
```

### Проблема: Изображения не загружаются

**Причина:** Неверный путь

**Решение:**
1. Поместите в `arche-vault/_imgs/`
2. Используйте `![[filename.png]]` или `![alt](filename.png)`
3. Проверьте консоль на ошибки

### Проблема: Snap не работает

**Причина:** Нет snap points

**Решение:**
1. Убедитесь, что заметки имеют `type: person/work/time`
2. Увеличьте `threshold` в `ScrollController`

---

## 📄 Лицензия

MIT

---

## 🙏 Благодарности

- [Josh Warren](https://www.joshwarrren.com/) — вдохновение для графа
- [Obsidian](https://obsidian.md) — вдохновение для UI
- [shadcn/ui](https://ui.shadcn.com/) — компоненты
- [Pixi.js](https://pixijs.com/) — рендеринг
- [Matter.js](https://brm.io/matter-js/) — физика

---

## 🔗 Ссылки

- **Документация:** [docs/](docs/)
- **Issues:** GitHub Issues
- **Discussions:** GitHub Discussions

---

**Enjoy exploring knowledge through time!** 🕰️✨
