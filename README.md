# Arche Explorer

Frontend-only приложение для просмотра и исследования базы знаний Arche (Obsidian-style markdown vault).

## Технологии

- React + TypeScript
- Vite
- shadcn/ui
- Tailwind CSS
- Zustand (state management)
- react-markdown + remark-gfm
- react-force-graph-2d
- gray-matter (парсинг frontmatter)

## Структура данных

Контент хранится в папке `arche-vault/` в корне проекта:

```
arche-vault/
  _rules/        → не отображается в UI
  _templates/    → не отображается в UI
  00_HUB/
  01_Time/
  02_People/
  03_Concepts/
  04_Events/
  05_Works/
  06_Culture/
  07_Places/
  08_Science/
  09_Notes/
```

Каждый `.md` файл может содержать:
- YAML frontmatter с метаданными (id, type, domain, status, group, created, updated)
- Markdown тело с поддержкой [[wikilinks]]

## Функциональность

### Dashboard
- **Sidebar**: Группировка заметок по папкам (Hub, Time, People, Concepts и т.д.)
- **Tabs**: Система вкладок для открытых заметок с возможностью закрепления
- **Note Viewer**: Просмотр markdown с поддержкой:
  - Заголовков, списков, ссылок
  - [[wikilinks]] с кликом для открытия связанных заметок
  - Метаданных (collapsible блок)
  - Исходящих и входящих ссылок

### Graph View
- Визуализация связей между заметками через [[wikilinks]]
- Фильтры по type, domain, status, folder
- Поиск по названию
- Режим "только связанные с выбранным"
- Ограничение по умолчанию (показываются важные заметки)
- Клик по ноде открывает заметку

### Настройки (localStorage)
Все пользовательские настройки сохраняются:
- Тема (light/dark)
- Состояние sidebar
- Открытые и закреплённые tabs
- Настройки графа (фильтры, цвета, силы)

## Установка и запуск

```bash
# Установка зависимостей
pnpm install

# Запуск dev-сервера
pnpm dev

# Сборка для production
pnpm build

# Превью production сборки
pnpm preview
```

## Обновление контента

Для обновления контента:
1. Обновите файлы в папке `arche-vault/`
2. Перезапустите dev-сервер или пересоберите проект

**Важно**: Изменения в `arche-vault/` подхватываются автоматически при перезапуске dev-сервера. При сборке для production все файлы включаются в бандл через `import.meta.glob`.

## Структура проекта

```
src/
  arche/
    types.ts              # TypeScript типы
    parser/
      index.ts           # Парсинг markdown и frontmatter
    state/
      store.ts           # Zustand store
    markdown/
      components.tsx     # Markdown viewer с wikilinks
    graph/
      GraphView.tsx      # Граф связей
    ui/
      Dashboard.tsx      # Главный компонент
      Sidebar.tsx         # Боковая панель
      Tabs.tsx           # Вкладки
      NoteViewer.tsx     # Просмотр заметки
      NoteMetaCard.tsx   # Карточка метаданных
```

## Особенности

- **Read-only**: Приложение только для просмотра, редактирование не поддерживается
- **Frontend-only**: Все данные загружаются статически через `import.meta.glob`
- **Быстрый поиск**: Индексация заметок для быстрого поиска по title
- **Граф связей**: Визуализация связей между заметками через wikilinks
- **Темы**: Поддержка light/dark режимов
- **Состояние**: Все настройки сохраняются в localStorage

## Развёртывание

Приложение готово к развёртыванию на Netlify, Vercel или любом другом статическом хостинге.

```bash
pnpm build
# Загрузите папку dist/ на хостинг
```
