/**
 * GraphPage - Простой граф на react-force-graph-2d
 * Без Pixi + Matter.js
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useArcheStore } from '@/arche/state/store';
import ForceGraph2D from 'react-force-graph-2d';
import { useNavigate } from 'react-router-dom';
import { GraphSettingsPanel, GraphSettings } from '@/components/graph/GraphSettingsPanel';

const DEFAULT_SETTINGS: GraphSettings = {
  nodeSize: 8,
  linkDistance: 100,
  chargeStrength: -200,
  filters: {
    types: [],
    domains: [],
  },
  showOnlyConnected: false,
};

export function GraphPage() {
  const notes = useArcheStore((state) => state.notes);
  const navigate = useNavigate();
  const [settings, setSettings] = useState<GraphSettings>(() => DEFAULT_SETTINGS);
  const graphRef = useRef<any>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  
  // Фильтрация заметок
  const filteredNotes = useMemo(() => {
    let result = notes;
    
    // Фильтр по типам
    if (settings.filters.types.length > 0) {
      result = result.filter(note => settings.filters.types.includes(note.type || ''));
    }
    
    // Фильтр по доменам
    if (settings.filters.domains.length > 0) {
      result = result.filter(note => {
        if (!note.domain || note.domain.length === 0) return false;
        return note.domain.some(d => settings.filters.domains.includes(d));
      });
    }
    
    return result;
  }, [notes, settings.filters]);
  
  // Цвета для типов нод
  const getNodeColor = (type: string): string => {
    const colors: Record<string, string> = {
      person: '#3b82f6',    // Синий
      work: '#8b5cf6',      // Фиолетовый
      concept: '#10b981',   // Зеленый
      time: '#f59e0b',      // Оранжевый
      place: '#ef4444',     // Красный
      hub: '#9ca3af',       // Серый
      note: '#6b7280',      // Серый
    };
    return colors[type] || '#6b7280';
  };

  // Строим граф из заметок
  const graphData = useMemo(() => {
    const nodes = filteredNotes.map(note => ({
      id: note.id,
      title: note.title,
      type: note.type || 'note',
      domain: note.domain || [],
      color: getNodeColor(note.type || 'note'),
    }));
    
    const links: Array<{ source: string; target: string }> = [];
    
    filteredNotes.forEach(note => {
      note.links.forEach(linkTitle => {
        // Ищем заметку по title
        const targetNote = filteredNotes.find(n => n.title === linkTitle);
        if (targetNote) {
          links.push({
            source: note.id,
            target: targetNote.id,
          });
        }
      });
    });
    
    // Если showOnlyConnected, оставляем только связанные ноды
    if (settings.showOnlyConnected) {
      const connectedNodeIds = new Set<string>();
      links.forEach(link => {
        connectedNodeIds.add(link.source as string);
        connectedNodeIds.add(link.target as string);
      });
      
      return {
        nodes: nodes.filter(n => connectedNodeIds.has(n.id)),
        links,
      };
    }
    
    return { nodes, links };
  }, [filteredNotes, settings.showOnlyConnected]);
  
  // Получаем цвет для связи (если hovered, то цвет ноды)
  const getLinkColor = useCallback((link: any): string => {
    if (!hoveredNodeId) return 'rgba(255, 255, 255, 0.2)';
    
    const hoveredNode = graphData.nodes.find((n: any) => n.id === hoveredNodeId);
    if (!hoveredNode) return 'rgba(255, 255, 255, 0.2)';
    
    // Проверяем, связана ли эта связь с hovered нодой
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    
    if (sourceId === hoveredNodeId || targetId === hoveredNodeId) {
      return hoveredNode.color || 'rgba(255, 255, 255, 0.2)';
    }
    
    return 'rgba(255, 255, 255, 0.1)';
  }, [hoveredNodeId, graphData]);
  
  // Применяем настройки к графу через d3Force API
  useEffect(() => {
    if (!graphRef.current) return;
    
    // Обновляем расстояние связей
    const linkForce = graphRef.current.d3Force('link');
    if (linkForce) {
      linkForce.distance(settings.linkDistance);
    }
    
    // Обновляем силу отталкивания
    const chargeForce = graphRef.current.d3Force('charge');
    if (chargeForce) {
      chargeForce.strength(settings.chargeStrength);
    }
    
    // Перезапускаем симуляцию для применения изменений
    graphRef.current.d3ReheatSimulation();
  }, [settings.linkDistance, settings.chargeStrength]);
  
  return (
    <div className="h-full w-full bg-background relative">
      {/* Панель настроек */}
      <GraphSettingsPanel
        settings={settings}
        onSettingsChange={setSettings}
      />
      
      {/* Граф */}
      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        nodeLabel={(node: any) => {
          const title = node.title || '';
          return title.length > 50 ? title.substring(0, 47) + '...' : title;
        }}
        nodeColor={(node: any) => node.color || getNodeColor(node.type || 'note')}
        linkColor={getLinkColor}
        onNodeHover={(node: any) => {
          setHoveredNodeId(node ? node.id : null);
        }}
        onNodeClick={(node: any) => {
          navigate(`/note/${node.id}`);
        }}
        nodeVal={settings.nodeSize}
        nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const label = node.title || '';
          const truncatedLabel = label.length > 50 ? label.substring(0, 47) + '...' : label;
          const fontSize = 12 / Math.max(1, globalScale);
          const nodeSize = settings.nodeSize;
          
          // Рисуем круг ноды
          ctx.beginPath();
          ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI, false);
          ctx.fillStyle = node.color || getNodeColor(node.type || 'note');
          ctx.fill();
          
          // Рисуем обводку (опционально, для лучшей видимости)
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 1;
          ctx.stroke();
          
          // Рисуем текст под нодой
          ctx.font = `${fontSize}px Sans-Serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = 'rgba(200, 200, 200, 0.8)'; // Серовато-белый
          ctx.fillText(truncatedLabel, node.x, node.y + nodeSize + 4);
        }}
        cooldownTicks={100}
        onEngineStop={() => {
          // Граф устаканился
        }}
      />
    </div>
  );
}

