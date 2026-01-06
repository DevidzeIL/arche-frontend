/**
 * GraphPage - Простой граф на react-force-graph-2d
 * Без Pixi + Matter.js
 */

import { useState, useMemo, useRef, useEffect } from 'react';
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
  const [settings, setSettings] = useState<GraphSettings>(DEFAULT_SETTINGS);
  const graphRef = useRef<any>();
  
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
  
  // Строим граф из заметок
  const graphData = useMemo(() => {
    const nodes = filteredNotes.map(note => ({
      id: note.id,
      title: note.title,
      type: note.type || 'note',
      domain: note.domain || [],
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
  
  // Применяем настройки к графу
  useEffect(() => {
    if (graphRef.current) {
      graphRef.current.d3Force('link')?.distance(settings.linkDistance);
      graphRef.current.d3Force('charge')?.strength(settings.chargeStrength);
    }
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
        nodeLabel={(node: any) => node.title}
        nodeColor={(node: any) => {
          const colors: Record<string, string> = {
            person: '#3b82f6',
            work: '#8b5cf6',
            concept: '#10b981',
            time: '#f59e0b',
            place: '#ef4444',
            note: '#6b7280',
          };
          return colors[node.type] || '#6b7280';
        }}
        linkColor={() => 'rgba(255, 255, 255, 0.2)'}
        onNodeClick={(node: any) => {
          navigate(`/note/${node.id}`);
        }}
        nodeVal={() => settings.nodeSize}
        linkDistance={settings.linkDistance}
        nodeRepulsion={settings.chargeStrength}
        cooldownTicks={100}
        onEngineStop={() => {
          // Граф устаканился
        }}
      />
    </div>
  );
}

