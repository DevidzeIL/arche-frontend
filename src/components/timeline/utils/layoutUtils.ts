import { TimelineNote } from '../types';

const CARD_WIDTH = 320; // ширина карточки
const LANE_HEIGHT = 180; // высота дорожки (карточка + отступ)
const MAX_LANES = 5; // максимум дорожек

export interface CardLayout {
  noteId: string;
  x: number;
  y: number;
  lane: number;
}

/**
 * Вычисляет layout для карточек, избегая наложения
 */
export function calculateCardLayout(
  notes: TimelineNote[],
  yearToPixel: (year: number) => number,
  containerHeight: number
): Map<string, CardLayout> {
  const layout = new Map<string, CardLayout>();
  
  // Сортируем по году
  const sortedNotes = [...notes].sort((a, b) => 
    a.timeline.displayYear - b.timeline.displayYear
  );
  
  // Трекаем занятые позиции на каждой дорожке
  const laneOccupancy: Array<{ endX: number; noteId: string }> = [];
  for (let i = 0; i < MAX_LANES; i++) {
    laneOccupancy.push({ endX: -Infinity, noteId: '' });
  }
  
  sortedNotes.forEach((note) => {
    const x = yearToPixel(note.timeline.displayYear);
    
    // Найти первую свободную дорожку
    let assignedLane = 0;
    for (let lane = 0; lane < MAX_LANES; lane++) {
      // Проверяем, свободна ли дорожка (с учётом отступа)
      if (laneOccupancy[lane].endX + 40 < x) { // 40px отступ между карточками
        assignedLane = lane;
        break;
      }
    }
    
    // Если все дорожки заняты, используем ту, которая освободится раньше
    if (assignedLane === 0 && laneOccupancy[0].endX + 40 >= x) {
      assignedLane = laneOccupancy.reduce((minLane, occupation, lane) => 
        occupation.endX < laneOccupancy[minLane].endX ? lane : minLane
      , 0);
    }
    
    // Вычисляем Y позицию
    // Центрируем группу дорожек вертикально
    const totalHeight = MAX_LANES * LANE_HEIGHT;
    const offsetY = (containerHeight - totalHeight) / 2;
    const y = offsetY + assignedLane * LANE_HEIGHT;
    
    // Занимаем дорожку
    laneOccupancy[assignedLane] = {
      endX: x + CARD_WIDTH,
      noteId: note.id,
    };
    
    layout.set(note.id, {
      noteId: note.id,
      x,
      y,
      lane: assignedLane,
    });
  });
  
  return layout;
}

/**
 * Упрощённая версия: чередуем карточки по двум дорожкам
 */
export function calculateSimpleLayout(
  notes: TimelineNote[],
  yearToPixel: (year: number) => number,
  containerHeight: number
): Map<string, CardLayout> {
  const layout = new Map<string, CardLayout>();
  
  // Сортируем по году
  const sortedNotes = [...notes].sort((a, b) => 
    a.timeline.displayYear - b.timeline.displayYear
  );
  
  const UPPER_OFFSET = containerHeight * 0.3; // верхняя дорожка
  const LOWER_OFFSET = containerHeight * 0.6; // нижняя дорожка
  
  sortedNotes.forEach((note, index) => {
    const x = yearToPixel(note.timeline.displayYear);
    
    // Чередуем верх/низ
    const isUpper = index % 2 === 0;
    const y = isUpper ? UPPER_OFFSET : LOWER_OFFSET;
    
    layout.set(note.id, {
      noteId: note.id,
      x,
      y,
      lane: isUpper ? 0 : 1,
    });
  });
  
  return layout;
}

