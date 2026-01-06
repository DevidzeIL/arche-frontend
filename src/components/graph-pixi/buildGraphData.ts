import { PixiNode, PixiEdge } from './types';

export interface GraphNode {
  id: string;
  title: string;
  type?: string;
  folder: string;
  links: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphSettings {
  nodeColors: Record<string, string>;
  nodeSizeBy: 'fixed' | 'links';
  nodeSize: number;
  linkDistance: number;
  linkForce: number;
  repelForce: number;
}

const SCALE = 3000; // Размер сцены

// Получить цвет ноды по типу
export function getNodeColor(type: string | undefined, nodeColors: Record<string, string>): string {
  if (type && nodeColors[type]) {
    return nodeColors[type];
  }
  
  switch (type) {
    case 'person': return '#3b82f6';
    case 'concept': return '#10b981';
    case 'event': return '#f59e0b';
    case 'work': return '#8b5cf6';
    case 'place': return '#ef4444';
    case 'time': return '#06b6d4';
    case 'note': return '#6b7280';
    default: return '#9ca3af';
  }
}

// Получить размер ноды
export function getNodeRadius(node: GraphNode, settings: GraphSettings): number {
  if (settings.nodeSizeBy === 'links') {
    return Math.max(3, Math.min(10, settings.nodeSize + node.links * 0.3));
  }
  return settings.nodeSize;
}

// Адаптер: наши GraphNode/GraphLink → PixiNode/PixiEdge
export function buildGraphData(
  nodes: GraphNode[],
  links: GraphLink[],
  settings: GraphSettings
): { nodes: PixiNode[]; edges: PixiEdge[] } {
  // Создаём PixiNode с случайными позициями
  const pixiNodes: PixiNode[] = nodes.map((node) => {
    // Случайная позиция в пределах сцены
    const x = (Math.random() - 0.5) * SCALE;
    const y = (Math.random() - 0.5) * SCALE;
    
    return {
      id: node.id,
      title: node.title,
      type: node.type,
      folder: node.folder,
      x,
      y,
      radius: getNodeRadius(node, settings),
      color: getNodeColor(node.type, settings.nodeColors),
      links: node.links,
    };
  });

  // Создаём PixiEdge
  const pixiEdges: PixiEdge[] = links.map((link) => ({
    sourceId: link.source,
    targetId: link.target,
  }));

  return { nodes: pixiNodes, edges: pixiEdges };
}


