/**
 * Типы метаданных для разных типов страниц
 */

export interface PersonMetadata {
  // Основное
  birthYear?: number;
  deathYear?: number;
  birthPlace?: string;
  deathPlace?: string;
  nationality?: string;
  occupation?: string[];
  
  // Визуальное
  portrait?: string; // путь к изображению
  
  // Контекст
  era?: string;
  movement?: string;
  school?: string;
  
  // Связи
  keyWorks?: string[]; // названия работ
  keyIdeas?: string[]; // названия концепций
  influences?: string[]; // влияния
  influenced?: string[]; // на кого повлиял
}

export interface WorkMetadata {
  // Основное
  year?: number;
  yearRange?: string; // "1920-1922"
  medium?: string; // "Масло на холсте", "Бумага, тушь"
  dimensions?: string; // "120 × 80 см"
  location?: string; // "Музей современного искусства, Нью-Йорк"
  collection?: string;
  source?: string; // URL источника
  
  // Визуальное
  image?: string; // путь к изображению
  images?: string[]; // несколько изображений
  
  // Контекст
  artist?: string; // имя автора
  period?: string; // эпоха
  style?: string; // стиль
  genre?: string;
  
  // Навигация
  previousWork?: string; // ID предыдущей работы
  nextWork?: string; // ID следующей работы
}

export interface ConceptMetadata {
  // Основное
  definition?: string; // краткое определение
  originYear?: number;
  originPerson?: string;
  
  // Структура
  keyQuestions?: string[]; // ключевые вопросы
  arguments?: string[]; // аргументы/варианты
  counterArguments?: string[];
  
  // Связи
  linkedPeople?: string[];
  linkedWorks?: string[];
  linkedConcepts?: string[];
  linkedTime?: string[];
}

export interface TimeMetadata {
  // Основное
  startYear: number;
  endYear: number;
  century?: number;
  
  // Описание
  essence?: string[]; // 5 тезисов о сути эпохи
  
  // Ключевые элементы
  keyPeople?: string[];
  keyWorks?: string[];
  keyConcepts?: string[];
  keyEvents?: string[];
  
  // Контекст
  previousEpoch?: string;
  nextEpoch?: string;
}

export interface IndexMetadata {
  // Для каталогов
  category?: string;
  sortBy?: 'title' | 'year' | 'type';
  groupBy?: 'type' | 'domain' | 'era';
}

