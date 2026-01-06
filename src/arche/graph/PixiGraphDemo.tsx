import { PixiGraphView } from './pixi';

// Тестовые данные - маленький граф для проверки качества
const testNodes = [
  { id: 'hub1', title: 'Философия', type: 'hub' },
  { id: '1', title: 'Платон', type: 'person' },
  { id: '2', title: 'Аристотель', type: 'person' },
  { id: '3', title: 'Логос', type: 'concept' },
  { id: '4', title: 'Душа', type: 'concept' },
  { id: '5', title: 'Античность', type: 'time' },
  { id: '6', title: 'Гераклит', type: 'person' },
  { id: '7', title: 'Космос', type: 'concept' },
  { id: '8', title: 'Разум', type: 'concept' },
  { id: '9', title: 'Бытие', type: 'concept' },
];

const testEdges = [
  // Hub связи
  { source: 'hub1', target: '1' },
  { source: 'hub1', target: '2' },
  { source: 'hub1', target: '3' },
  // Основные связи
  { source: '1', target: '3' },
  { source: '2', target: '3' },
  { source: '1', target: '4' },
  { source: '2', target: '4' },
  { source: '5', target: '1' },
  { source: '5', target: '2' },
  { source: '6', target: '3' },
  { source: '6', target: '7' },
  { source: '5', target: '6' },
  { source: '3', target: '8' },
  { source: '4', target: '8' },
  { source: '8', target: '9' },
  { source: '7', target: '9' },
];

export function PixiGraphDemo() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          color: 'white',
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          padding: '10px',
          borderRadius: '5px',
          zIndex: 1000,
        }}
      >
        <div><strong>Controls:</strong></div>
        <div>• Перетаскивайте ноды мышью</div>
        <div>• Колесо мыши для zoom</div>
        <div>• Перетаскивайте фон для pan</div>
        <div>• Наведите на ноду для подсветки</div>
        <div>• Кликните для выделения</div>
      </div>
      <PixiGraphView
        nodes={testNodes}
        edges={testEdges}
        onNodeClick={(nodeId) => {
          const node = testNodes.find((n) => n.id === nodeId);
          console.log('Node clicked:', node?.title);
        }}
        onNodeHover={(nodeId) => {
          if (nodeId) {
            const node = testNodes.find((n) => n.id === nodeId);
            console.log('Node hovered:', node?.title);
          }
        }}
      />
    </div>
  );
}

