# Руководство по шаблонам страниц

## Обзор

Создано 5 шаблонов страниц в стиле "арт-энциклопедия":

1. **PersonPage** - для персон
2. **WorkPage** - для произведений/работ
3. **ConceptPage** - для концепций/идей
4. **TimePage** - для эпох/периодов
5. **Default** - fallback для других типов

## Структура метаданных (Frontmatter)

### Person (type: person)

```yaml
---
type: person
birthYear: 1883
deathYear: 1924
birthPlace: Прага
deathPlace: Вена
nationality: Чехословакия
occupation: [писатель, философ]
portrait: Franz_Kafka.jpg
era: Модернизм
movement: Экзистенциализм
school: Немецкая литература
keyWorks: [Процесс, Замок, Превращение]
keyIdeas: [Абсурд, Отчуждение, Бюрократия]
influences: [Кьеркегор, Достоевский]
influenced: [Кафка, Сартр]
---
```

### Work (type: work)

```yaml
---
type: work
year: 1925
yearRange: "1924-1926"
medium: Масло на холсте
dimensions: "120 × 80 см"
location: Музей современного искусства, Нью-Йорк
collection: Коллекция Пегги Гуггенхайм
source: https://example.com/image.jpg
image: painting.jpg
images: [painting.jpg, detail1.jpg, detail2.jpg]
artist: Василий Кандинский
period: Модернизм
style: Абстракционизм
genre: Живопись
previousWork: note-id-1
nextWork: note-id-2
---
```

### Concept (type: concept)

```yaml
---
type: concept
definition: Краткое определение концепции в одном предложении
originYear: 1781
originPerson: Иммануил Кант
keyQuestions:
  - Вопрос 1
  - Вопрос 2
  - Вопрос 3
arguments:
  - Аргумент 1
  - Аргумент 2
counterArguments:
  - Контр-аргумент 1
linkedPeople: [Кант, Гегель]
linkedWorks: [Критика чистого разума]
linkedConcepts: [Трансцендентальный идеализм]
linkedTime: [Немецкая классическая философия]
---
```

### Time/Epoch (type: time или epoch)

```yaml
---
type: time
startYear: 1900
endYear: 1950
century: 20
essence:
  - Тезис 1 о сути эпохи
  - Тезис 2
  - Тезис 3
  - Тезис 4
  - Тезис 5
keyPeople: [Эйнштейн, Пикассо, Кафка]
keyWorks: [Теория относительности, Герника]
keyConcepts: [Модернизм, Абсурд]
keyEvents: [Первая мировая война, Вторая мировая война]
previousEpoch: Романтизм
nextEpoch: Постмодернизм
---
```

## Типографика

### Общие правила

- **Заголовки**: Serif (Crimson Pro), font-light, большие размеры (5xl-6xl)
- **Основной текст**: Sans-serif (Inter), text-base, leading-relaxed (1.6-1.8)
- **Максимальная ширина текста**: 65-75ch (примерно 700-800px)
- **Межстрочный интервал**: 1.6-1.8 для основного текста
- **Отступы**: 6-8 единиц между секциями

### Размеры

- Hero заголовок: `text-5xl lg:text-6xl`
- Подзаголовки секций: `text-2xl font-serif`
- Основной текст: `text-base` (16px)
- Метаданные: `text-sm text-muted-foreground`
- Боковые панели: `text-sm`

## Адаптивность

### Desktop (lg: 1024px+)

- Grid: 3 колонки (2 для контента, 1 для sidebar)
- Изображения: крупные, sticky positioning
- Навигация: горизонтальная

### Tablet (md: 768px+)

- Grid: 2 колонки или 1 колонка
- Изображения: адаптивные размеры
- Навигация: упрощённая

### Mobile (< 768px)

- Grid: 1 колонка
- Изображения: полная ширина
- Навигация: вертикальная, компактная

## Компоненты

### PersonPage

**Особенности:**
- Портрет слева (3:4 aspect ratio)
- Hero с кратким интро
- Метаданные: годы жизни, место, национальность, профессия
- Боковая панель: контекст, ключевые работы, ключевые идеи

**Layout:**
```
[Портрет] [Заголовок + Интро + Мета]
[Основной текст (2/3)] [Боковая панель (1/3)]
[Связанные заметки]
```

### WorkPage

**Особенности:**
- Крупное изображение справа (sticky)
- Текст слева, читаемая ширина
- Подпись: год, техника, размеры, место, источник
- Навигация: prev/next по работам

**Layout:**
```
[Заголовок + Мета]
[Текст (1/2)] [Изображение + Подпись (1/2, sticky)]
[Связанные заметки]
```

### ConceptPage

**Особенности:**
- Краткое определение в hero
- Боковая панель: ключевые вопросы, аргументы, контр-аргументы
- Акцент на структуру и логику

**Layout:**
```
[Заголовок + Определение]
[Основной текст (2/3)] [Боковая панель (1/3)]
[Связанные заметки]
```

### TimePage

**Особенности:**
- Hero с диапазоном лет
- "Суть эпохи" - 5 тезисов в grid
- Ключевые элементы: люди, работы, концепции
- Кнопка "На таймлайне"

**Layout:**
```
[Заголовок + Годы]
[Суть эпохи (grid 3 колонки)]
[Основной текст]
[Ключевые элементы (grid 3 колонки)]
[Связанные заметки]
```

## Использование

Страница автоматически выбирает правильный шаблон на основе `note.type`:

```typescript
// В NotePage.tsx
switch (note.type) {
  case 'person': return <PersonPage ... />;
  case 'work': return <WorkPage ... />;
  case 'concept': return <ConceptPage ... />;
  case 'time':
  case 'epoch': return <TimePage ... />;
  default: return <DefaultTemplate ... />;
}
```

## Примеры

### Пример Person

```markdown
---
type: person
birthYear: 1883
deathYear: 1924
nationality: Чехословакия
occupation: [писатель]
portrait: Franz_Kafka.jpg
era: Модернизм
keyWorks: [Процесс, Замок]
---

# Франц Кафка

Основной текст заметки...
```

### Пример Work

```markdown
---
type: work
year: 1925
medium: Масло на холсте
dimensions: "120 × 80 см"
location: Музей современного искусства
image: painting.jpg
artist: Василий Кандинский
---

# Композиция VIII

Описание произведения...
```

## Стилизация

Все компоненты используют:
- Tailwind CSS классы
- CSS переменные для цветов (light/dark theme)
- Адаптивные breakpoints (sm, md, lg)
- MuseumCard для связанных заметок
- TypeBadge для типов

## Следующие шаги

1. Добавить lightbox для изображений
2. Добавить навигацию по категориям
3. Добавить поиск по метаданным
4. Добавить экспорт в PDF/PNG
5. Добавить шаринг страниц


