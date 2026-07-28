# Arche — личная энциклопедия культуры и философии

Obsidian-хранилище с заметками превращается в статичный сайт: каталог с поиском,
интерактивный таймлайн и граф связей. Бэкенда нет — заметки вшиваются в бандл на этапе сборки.

## Запуск

```bash
pnpm install
pnpm dev        # http://localhost:5177
```

Команды:

| Команда | Что делает |
| --- | --- |
| `pnpm dev` | Dev-сервер с hot reload |
| `pnpm build` | Проверка типов + production-сборка в `dist/` |
| `pnpm preview` | Локальный просмотр собранного `dist/` |
| `pnpm typecheck` | Только проверка типов |

## Структура

```
arche-vault/           # Заметки (источник данных)
  00_HUB/              # Хабы-указатели
  01_Time/             # Эпохи
  02_People/           # Персоны
  03_Concepts/         # Концепции
  05_Works/            # Работы
  06_Culture/          # Культурные течения
  _imgs/               # Изображения
  _rules/, _templates/ # Не попадают в приложение (папки с _ игнорируются)

src/
  arche/
    noteTypes.ts       # Реестр типов заметок: подписи, цвета, порядок
    search.ts          # Поиск и фильтрация (главная + Cmd+K)
    parser/            # Разбор markdown и frontmatter
    state/             # Zustand-store, индексы и обратные ссылки
    markdown/          # Рендер markdown и wikilinks
  components/
    museum/            # Оболочка: навигация, карточки, бейджи
    timeline/          # Таймлайн: проекция, строки, слои, скролл
    graph/             # Настройки графа
    search/            # Палитра Cmd+K
    pages/             # Шаблоны страниц по типу заметки
    ui/                # shadcn/ui
  pages/               # Экраны роутера
```

## Разделы

- **Главная** — каталог по типам, поиск и фильтры (состояние живёт в URL, ссылкой можно делиться)
- **Таймлайн** (`/timeline`) — заметки на шкале от −800 до 2025 по семантическим строкам,
  зум out/mid/in, focus-mode по клику, миникарта
- **Граф** (`/graph`) — force-directed граф связей по wikilinks
- **Заметка** (`/note/:id`) — свой шаблон для персон, работ, концепций и эпох

Горячие клавиши: `⌘K` / `Ctrl+K` или `/` — поиск, `Esc` — выйти из focus-mode.

## Как добавить заметку

Создайте `.md` в подходящей папке `arche-vault/`:

```markdown
---
id: person-plato-001
type: person
domain: [philosophy]
status: seed
start_year: -428
end_year: -348
year_precision: approximate
created: 2026-01-03
---

# Платон

**Годы жизни:** 428/427–348/347 до н.э.

Ученик [[Сократ|Сократа]], учитель [[Аристотель|Аристотеля]].
```

### Поля frontmatter

| Поле | Обязательно | Значения |
| --- | --- | --- |
| `id` | да | Уникальный идентификатор, он же адрес страницы `/note/<id>` |
| `type` | да | `hub`, `time`, `person`, `work`, `concept`, `culture`, `event`, `place`, `note` |
| `domain` | нет | `philosophy`, `history`, `culture`, `religion`, `science`, `literature`, `art`, `education`, `psychology` |
| `status` | нет | Стадия проработки заметки |
| `start_year` | для таймлайна | Год начала. До н.э. — отрицательный: `-428` |
| `end_year` | нет | Год окончания интервала |
| `display_year` | нет | Год, в котором заметка стоит на шкале (по умолчанию выводится, см. ниже) |
| `year_precision` | нет | `exact`, `approximate`, `century` — влияет на формат подписи |

### Как считается датировка

Порядок источников, от надёжного к запасному:

1. `start_year` / `end_year` из frontmatter — **основной способ**
2. Датировка из текста заметки: строка `**Годы жизни:** 384–322 до н.э.`, `**Год:** 1795`,
   римские века (`XIV–XVI века`), формы со слэшем (`428/427–348/347 до н.э.`)
3. Для эпох — догадка по названию

Заметка без датировки на таймлайн не попадает, но остаётся в каталоге, поиске и графе.

Год на шкале (`display_year`), если не задан явно: для персон и работ — год начала
(рождение, публикация), для эпох, концепций и течений — середина интервала.

Новый тип заметок добавляется в одном месте — [src/arche/noteTypes.ts](src/arche/noteTypes.ts).
Подписи, цвета, порядок секций, строки таймлайна и фильтры подхватят его автоматически.

### Изображения

Положите файл в `arche-vault/_imgs/` и сошлитесь любым способом:

```markdown
![[Plato.png]]
![Платон](Plato.png)
```

## Технологии

React 19, TypeScript, Vite 5, Tailwind 3 + shadcn/ui, React Router 7, Zustand,
react-markdown + remark-gfm, react-force-graph-2d. Таймлайн написан вручную,
без библиотеки.

## Деплой

Netlify: сборка `npm run build`, публикация `dist`, SPA-fallback настроен
в [netlify.toml](netlify.toml).

## Документация

- [docs/TIME_RULER_USAGE.md](docs/TIME_RULER_USAGE.md) — работа с таймлайном
- [docs/TIME_RULER_DESIGN.md](docs/TIME_RULER_DESIGN.md) — устройство таймлайна
- [docs/FOCUS_MODE_GUIDE.md](docs/FOCUS_MODE_GUIDE.md) — focus-mode
- [docs/PAGE_TEMPLATES_GUIDE.md](docs/PAGE_TEMPLATES_GUIDE.md) — шаблоны страниц
