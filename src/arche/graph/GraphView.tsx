import { useRef, useMemo, useState, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useArcheStore, normalizeTitle } from '../state/store';
import { extractWikilinks, normalizeWikilinkTarget, EXCLUDED_FOLDERS } from '../parser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Search, Play, Bug, Zap } from 'lucide-react';
import { PixiGraphView } from './pixi';

// Утилита для создания ключа связи (безопасна для ID с дефисами)
// Используем null-символ как разделитель (не встречается в ID)
const SEP = '\u0000';
const linkKeyOf = (source: string, target: string): string => {
  return `${source}${SEP}${target}`;
};

const parseLinkKey = (key: string): [string, string] => {
  const parts = key.split(SEP);
  if (parts.length !== 2) {
    throw new Error(`Invalid link key format: ${key}`);
  }
  return [parts[0], parts[1]];
};

interface GraphNode {
  id: string;
  title: string;
  type?: string;
  domain?: string[];
  status?: string;
  folder: string;
  links: number;
}

interface GraphLink {
  source: string; // ВСЕГДА строка (note.id)
  target: string; // ВСЕГДА строка (note.id)
}

export function GraphView() {
  const fgRef = useRef<any>(null);
  const graphWrapperRef = useRef<HTMLDivElement>(null);
  const notes = useArcheStore((state) => state.notes);
  const openNote = useArcheStore((state) => state.openNote);
  const graphSettings = useArcheStore((state) => state.settings.graphSettings);
  const updateGraphSettings = useArcheStore((state) => state.updateGraphSettings);
  const getNoteByTitle = useArcheStore((state) => state.getNoteByTitle);

  const [searchQuery, setSearchQuery] = useState('');
  const [showAllNodes, setShowAllNodes] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [usePixiGraph, setUsePixiGraph] = useState(false);
  
  // Obsidian-like simulation control (через cooldownTicks — надёжный способ)
  const [cooldownTicks, setCooldownTicks] = useState(120); // быстрый settle
  
  const settleSimulation = () => {
    const fg = fgRef.current;
    if (!fg) return;
    
    // Быстрый settle: ограниченное количество тиков
    setCooldownTicks(120);
    fg.d3ReheatSimulation();
  };

  const reheat = () => {
    // "Animate" button: reheat с чуть более долгой симуляцией
    const fg = fgRef.current;
    if (!fg) return;
    
    setCooldownTicks(180);
    fg.d3ReheatSimulation();
  };

  // Строим граф - ВСЕГДА строки в source/target
  const { nodes, links } = useMemo(() => {
    const nodesMap = new Map<string, GraphNode>();
    const linksSet = new Set<string>();

    // Создаём ноды
    notes.forEach((note) => {
      // Подсчитываем входящие ссылки с нормализацией
      const normalizedNoteTitle = normalizeTitle(note.title);
      const incomingLinks = notes.filter((n) => {
        const noteLinks = n.links.length > 0 ? n.links : 
          (n.body && !n.folder.startsWith('_') && !EXCLUDED_FOLDERS.includes(n.folder) 
            ? extractWikilinks(n.body) : []);
        return noteLinks.some(link => {
          const normalized = normalizeWikilinkTarget(link) || link;
          return normalizeTitle(normalized) === normalizedNoteTitle;
        });
      }).length;

      nodesMap.set(note.id, {
        id: note.id,
        title: note.title,
        type: note.type,
        domain: note.domain,
        status: note.status,
        folder: note.folder,
        links: incomingLinks,
      });
    });

    // Создаём связи - ВСЕГДА строки
    let totalLinksFound = 0;
    notes.forEach((note) => {
      // Используем note.links если он уже рассчитан парсером
      let noteLinks = note.links;
      
      // Fallback: парсим из body только если:
      // 1. note.links пустой
      // 2. note.folder НЕ начинается с '_' и НЕ в excluded folders
      if (noteLinks.length === 0 && note.body) {
        const isExcluded = note.folder.startsWith('_') || EXCLUDED_FOLDERS.includes(note.folder);
        if (!isExcluded) {
          noteLinks = extractWikilinks(note.body);
        }
      }

      noteLinks.forEach((linkTitle) => {
        // linkTitle уже нормализован парсером, но на всякий случай нормализуем ещё раз
        const normalized = normalizeWikilinkTarget(linkTitle) || linkTitle;
        if (!normalized) return; // Пропускаем пустые
        
        const targetNote = getNoteByTitle(normalized);
        
        // ЖЁСТКИЕ ПРАВИЛА: связь создаётся ТОЛЬКО если:
        // 1. Target резолвится в существующую заметку
        // 2. Target существует в nodesMap
        // 3. source.id ≠ target.id (нет самоссылок)
        // 4. Связь создаётся один раз (проверка через Set)
        if (targetNote && nodesMap.has(targetNote.id) && note.id !== targetNote.id) {
          const linkKey = linkKeyOf(note.id, targetNote.id);
          if (!linksSet.has(linkKey)) {
            linksSet.add(linkKey);
            totalLinksFound++;
          }
        }
      });
    });

    const allNodes = Array.from(nodesMap.values());
    const nodeIdsSet = new Set(allNodes.map(n => n.id));
    
    // Валидация: создаём только связи с существующими нодами
    const allLinks: GraphLink[] = Array.from(linksSet)
      .map((key) => {
        const [sourceId, targetId] = parseLinkKey(key);
        return { source: sourceId, target: targetId };
      })
      .filter((link) => {
        // Фильтруем связи, где source или target не существуют
        const isValid = nodeIdsSet.has(link.source) && nodeIdsSet.has(link.target);
        if (!isValid) {
          console.warn(`Invalid link: ${link.source} -> ${link.target} (node not found)`);
        }
        return isValid;
      });

    // Проверка на дубликаты (должно быть 0 после валидации)
    const linkKeysSet = new Set<string>();
    const duplicates: GraphLink[] = [];
    allLinks.forEach(link => {
      const key = linkKeyOf(link.source, link.target);
      if (linkKeysSet.has(key)) {
        duplicates.push(link);
      }
      linkKeysSet.add(key);
    });

    console.log('Graph data', { 
      nodes: allNodes.length, 
      links: allLinks.length,
      totalLinksFound,
      duplicates: duplicates.length, // Должно быть 0
      sampleLinks: allLinks.slice(0, 5).map(link => {
        const sourceNode = allNodes.find(n => n.id === link.source);
        const targetNode = allNodes.find(n => n.id === link.target);
        return {
          source: sourceNode?.title || link.source,
          target: targetNode?.title || link.target,
        };
      })
    });

    if (duplicates.length > 0) {
      console.error('Found duplicate links:', duplicates);
    }

    return { nodes: allNodes, links: allLinks };
  }, [notes, getNoteByTitle]);

  // Вычисляем highlight nodes и links для hover
  const { highlightNodes, highlightLinks } = useMemo(() => {
    if (!hoveredNodeId) {
      return { highlightNodes: new Set<string>(), highlightLinks: new Set<string>() };
    }

    const highlightNodesSet = new Set<string>([hoveredNodeId]);
    const highlightLinksSet = new Set<string>();

    // Находим все соседние ноды и связи
    links.forEach((link) => {
      if (link.source === hoveredNodeId) {
        highlightNodesSet.add(link.target);
        highlightLinksSet.add(linkKeyOf(link.source, link.target));
      } else if (link.target === hoveredNodeId) {
        highlightNodesSet.add(link.source);
        highlightLinksSet.add(linkKeyOf(link.source, link.target));
      }
    });

    return { highlightNodes: highlightNodesSet, highlightLinks: highlightLinksSet };
  }, [hoveredNodeId, links]);

  // Фильтрация - source/target ВСЕГДА строки
  const filteredData = useMemo(() => {
    let filteredNodes = nodes;
    let filteredLinks = links;

    // Фильтр по поисковому запросу
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredNodes = filteredNodes.filter(
        (node) => node.title.toLowerCase().includes(query)
      );
      const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
      filteredLinks = filteredLinks.filter(
        (link) =>
          filteredNodeIds.has(link.source) && filteredNodeIds.has(link.target)
      );
    }

    // Фильтры по метаданным
    if (graphSettings.filters.types.length > 0) {
      filteredNodes = filteredNodes.filter(
        (node) => node.type && graphSettings.filters.types.includes(node.type)
      );
    }
    if (graphSettings.filters.folders.length > 0) {
      filteredNodes = filteredNodes.filter(
        (node) => graphSettings.filters.folders.includes(node.folder)
      );
    }
    if (graphSettings.filters.statuses.length > 0) {
      filteredNodes = filteredNodes.filter(
        (node) => node.status && graphSettings.filters.statuses.includes(node.status)
      );
    }

    // Обновляем связи после фильтрации
    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
    filteredLinks = filteredLinks.filter(
      (link) =>
        filteredNodeIds.has(link.source) && filteredNodeIds.has(link.target)
    );

    // Режим "только связанные с выбранным"
    if (graphSettings.showOnlyConnected && graphSettings.selectedNodeId) {
      const selectedId = graphSettings.selectedNodeId;
      const connectedIds = new Set([selectedId]);

      const findConnected = (nodeId: string) => {
        filteredLinks.forEach((link) => {
          if (link.source === nodeId && !connectedIds.has(link.target)) {
            connectedIds.add(link.target);
            findConnected(link.target);
          }
          if (link.target === nodeId && !connectedIds.has(link.source)) {
            connectedIds.add(link.source);
            findConnected(link.source);
          }
        });
      };

      findConnected(selectedId);
      filteredNodes = filteredNodes.filter((node) => connectedIds.has(node.id));
      filteredLinks = filteredLinks.filter(
        (link) =>
          connectedIds.has(link.source) && connectedIds.has(link.target)
      );
    }

    // Ограничение по умолчанию
    if (!showAllNodes && filteredNodes.length > 100) {
      const importantNodes = filteredNodes
        .filter((n) => n.type !== 'note' || n.links > 0)
        .sort((a, b) => b.links - a.links)
        .slice(0, 100);

      const importantIds = new Set(importantNodes.map((n) => n.id));
      filteredNodes = importantNodes;
      filteredLinks = filteredLinks.filter(
        (link) =>
          importantIds.has(link.source) && importantIds.has(link.target)
      );
    }

    return { nodes: filteredNodes, links: filteredLinks };
  }, [
    nodes,
    links,
    searchQuery,
    graphSettings.filters,
    graphSettings.showOnlyConnected,
    graphSettings.selectedNodeId,
    showAllNodes,
  ]);

  // Цвета нод с учетом hover (fog of war)
  const getNodeColor = (node: GraphNode): string => {
    const isHighlighted = highlightNodes.has(node.id);
    let color = graphSettings.nodeColors[node.type || ''] || 
      (node.type === 'hub' ? '#EAB876' :        // Золотистый акцент
       node.type === 'person' ? '#679D86' :     // Приглушенный зеленый
       node.type === 'concept' ? '#83C0E9' :    // Мягкий голубой
       node.type === 'work' ? '#D69BB6' :       // Пыльная роза
       node.type === 'time' ? '#A29BFE' :       // Мягкая лаванда
       node.type === 'tag' ? '#8E9AAF' :        // Серо-голубой (служебные)
       node.type === 'note' ? '#8E9AAF' :        // Серо-голубой
       '#8E9AAF');                               // Серо-голубой по умолчанию
    
    // Fog of war: если есть hovered node и текущая нода не highlighted - делаем приглушённой
    if (hoveredNodeId && !isHighlighted) {
      const hex = color.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      // Alpha 0.12-0.25 для не-соседних нод
      return `rgba(${r}, ${g}, ${b}, 0.18)`;
    }
    
    return color;
  };

  // Размер нод в зависимости от количества соединений
  const getNodeSize = (node: GraphNode): number => {
    // Базовый размер + масштабирование по количеству входящих связей
    const baseSize = graphSettings.nodeSize;
    const linksCount = node.links || 0;
    
    // Логарифмическое масштабирование для более плавного роста
    // Больше связей = больше размер, но с убывающей скоростью
    const sizeMultiplier = 1 + Math.log(1 + linksCount * 0.5) * 0.8;
    const calculatedSize = baseSize * sizeMultiplier;
    
    // Ограничиваем размер: минимум 3, максимум 20
    return Math.max(3, Math.min(20, calculatedSize));
  };

  // Состояние для globalScale (обновляется через onZoom)
  const [globalScale, setGlobalScale] = useState(1);

  // Цвет и толщина связей с учетом hover и zoom (LOD + fog of war, Obsidian-like)
  const getLinkColor = (link: GraphLink): string => {
    const linkKey = linkKeyOf(link.source, link.target);
    const isHighlighted = highlightLinks.has(linkKey);
    
    // LOD: на очень далёком зуме почти выключаем рёбра (Obsidian behavior)
    if (globalScale < 0.45) {
      return isHighlighted ? 'rgba(131, 192, 233, 0.75)' : 'rgba(150, 150, 150, 0.02)';
    }
    
    if (isHighlighted) {
      // Подсвеченные связи при hover: яркий цвет с высокой непрозрачностью
      return 'rgba(131, 192, 233, 0.95)'; // Мягкий голубой (#83C0E9) с высокой видимостью
    }
    
    // Fog of war: не-соседние связи почти невидимые при hover
    if (hoveredNodeId) {
      return 'rgba(150, 150, 150, 0.06)';
    }
    
    // Обычные связи: opacity зависит от zoom
    const baseOpacity = globalScale < 1 ? 0.18 : 0.12;
    return `rgba(150, 150, 150, ${baseOpacity})`;
  };

  const getLinkWidth = (link: GraphLink): number => {
    const linkKey = linkKeyOf(link.source, link.target);
    const isHighlighted = highlightLinks.has(linkKey);
    const baseWidth = graphSettings.linkThickness;
    
    // Подсвеченные связи при hover: заметно толще и ярче
    if (isHighlighted) {
      const highlightedWidth = baseWidth * 2.0; // Увеличено с 1.6 до 2.0 для большей заметности
      if (globalScale < 1) {
        return highlightedWidth;
      }
      return highlightedWidth * (1 / globalScale) * 0.8;
    }
    
    if (globalScale < 1) {
      return baseWidth;
    }
    return baseWidth * (1 / globalScale) * 0.8;
  };

  // Уникальные значения для фильтров
  const uniqueTypes = useMemo(
    () => [...new Set(nodes.map((n) => n.type).filter(Boolean))],
    [nodes]
  );
  const uniqueFolders = useMemo(
    () => [...new Set(nodes.map((n) => n.folder))],
    [nodes]
  );

  // Правильная настройка forces (Obsidian-like) + предотвращение перекрытий
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    const linkForce = fg.d3Force('link');
    if (linkForce) {
      linkForce.distance(graphSettings.linkDistance);
      linkForce.strength(graphSettings.linkForce);
    }

    const charge = fg.d3Force('charge');
    if (charge) {
      // Усиливаем отталкивание для предотвращения перекрытий
      // Учитываем, что ноды имеют разные размеры - нужно более сильное отталкивание
      // Используем динамический расчёт на основе среднего размера нод
      const avgNodeSize = filteredData.nodes.length > 0
        ? filteredData.nodes.reduce((sum, n) => sum + getNodeSize(n), 0) / filteredData.nodes.length
        : graphSettings.nodeSize;
      
      // Усиливаем отталкивание пропорционально размеру нод
      const sizeMultiplier = Math.max(1, avgNodeSize / 5);
      charge.strength(graphSettings.repelForce * 2.0 * sizeMultiplier);
    }

    // Добавляем collision force для предотвращения перекрытий нод
    // Используем d3Force API react-force-graph-2d
    try {
      // Проверяем, есть ли уже collision force
      let collision = fg.d3Force('collision');
      
      if (!collision) {
        // Пытаемся создать через внутренний API
        // react-force-graph-2d может иметь доступ к d3 через внутренние методы
        const simulation = fg.d3ForceSimulation?.();
        if (simulation) {
          // Попробуем использовать d3Force для добавления кастомной силы
          // Если d3 доступен глобально (через react-force-graph-2d)
          const d3Module = (window as any).d3 || (globalThis as any).d3;
          if (d3Module && d3Module.forceCollide) {
            collision = d3Module.forceCollide((node: any) => {
              const nodeSize = getNodeSize(node);
              return nodeSize + 4; // +4 пикселя отступ
            }).strength(0.95);
            fg.d3Force('collision', collision);
          }
        }
      } else {
        // Обновляем существующий collision force
        collision.radius((node: any) => {
          const nodeSize = getNodeSize(node);
          return nodeSize + 4;
        });
        if (collision.strength) {
          collision.strength(0.95);
        }
      }
    } catch (e) {
      // Если collision force недоступен, просто усилим charge force
      console.debug('Collision force not available, using enhanced charge force');
    }

    // Мягко "досадить" после изменения сил
    settleSimulation();
  }, [
    graphSettings.linkDistance,
    graphSettings.linkForce,
    graphSettings.repelForce,
    graphSettings.centerForce,
    filteredData.nodes, // Добавляем для пересчёта размеров
  ]);

  // Автоматический zoom при изменении данных (только при initial load)
  const [hasInitialZoom, setHasInitialZoom] = useState(false);
  useEffect(() => {
    if (!fgRef.current) return;
    if (filteredData.nodes.length === 0) return;

    // Initial settle: быстро "садим" граф как в Obsidian
    settleSimulation();

    // Мягкий fit только один раз
    if (!hasInitialZoom) {
      const timer = setTimeout(() => {
        fgRef.current?.zoomToFit(700, 60);
        setHasInitialZoom(true);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [filteredData.nodes.length]);

  // Кнопка Animate/Reheat (Obsidian-like)
  const handleAnimate = () => {
    if (fgRef.current) {
      reheat();
      fgRef.current.zoomToFit(700, 60);
    }
  };

  // Unpin all nodes (Obsidian-like)
  const handleUnpinAll = () => {
    if (fgRef.current) {
      filteredData.nodes.forEach((node: any) => {
        node.fx = null;
        node.fy = null;
      });
      settleSimulation();
    }
  };

  return (
    <div className="flex h-full w-full bg-background overflow-hidden">
      {/* Панель фильтров */}
      <div className="w-80 flex-shrink-0 border-r bg-muted/40">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Фильтры</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Переключатель графа */}
                <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
                  <Label htmlFor="usePixiGraph" className="cursor-pointer flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Pixi + Matter.js граф
                  </Label>
                  <Switch
                    id="usePixiGraph"
                    checked={usePixiGraph}
                    onCheckedChange={setUsePixiGraph}
                  />
                </div>

                {/* Поиск */}
                <div>
                  <Label>Поиск</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Название заметки..."
                      className="pl-8"
                    />
                    {searchQuery && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full"
                        onClick={() => setSearchQuery('')}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Type фильтр */}
                <div>
                  <Label>Type</Label>
                  <Select
                    value=""
                    onValueChange={(value) => {
                      const current = graphSettings.filters.types;
                      if (value && !current.includes(value)) {
                        updateGraphSettings({
                          filters: {
                            ...graphSettings.filters,
                            types: [...current, value],
                          },
                        });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите type" />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueTypes.map((type) => (
                        <SelectItem key={type} value={type || ''}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {graphSettings.filters.types.map((type) => (
                      <Badge
                        key={type}
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => {
                          updateGraphSettings({
                            filters: {
                              ...graphSettings.filters,
                              types: graphSettings.filters.types.filter((t) => t !== type),
                            },
                          });
                        }}
                      >
                        {type} <X className="ml-1 h-3 w-3 inline" />
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Folder фильтр */}
                <div>
                  <Label>Folder</Label>
                  <Select
                    value=""
                    onValueChange={(value) => {
                      const current = graphSettings.filters.folders;
                      if (value && !current.includes(value)) {
                        updateGraphSettings({
                          filters: {
                            ...graphSettings.filters,
                            folders: [...current, value],
                          },
                        });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите folder" />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueFolders.map((folder) => (
                        <SelectItem key={folder} value={folder}>
                          {folder}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {graphSettings.filters.folders.map((folder) => (
                      <Badge
                        key={folder}
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => {
                          updateGraphSettings({
                            filters: {
                              ...graphSettings.filters,
                              folders: graphSettings.filters.folders.filter(
                                (f) => f !== folder
                              ),
                            },
                          });
                        }}
                      >
                        {folder} <X className="ml-1 h-3 w-3 inline" />
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Показать все ноды */}
                <div className="flex items-center justify-between">
                  <Label htmlFor="showAll" className="cursor-pointer">
                    Показать все ноды
                  </Label>
                  <Switch
                    id="showAll"
                    checked={showAllNodes}
                    onCheckedChange={setShowAllNodes}
                  />
                </div>

                {/* Только связанные */}
                <div className="flex items-center justify-between">
                  <Label htmlFor="showOnlyConnected" className="cursor-pointer">
                    Только связанные
                  </Label>
                  <Switch
                    id="showOnlyConnected"
                    checked={graphSettings.showOnlyConnected}
                    onCheckedChange={(checked) =>
                      updateGraphSettings({ showOnlyConnected: checked })
                    }
                  />
                </div>

                {/* Debug mode */}
                <div className="flex items-center justify-between">
                  <Label htmlFor="debugMode" className="cursor-pointer flex items-center gap-2">
                    <Bug className="h-4 w-4" />
                    Debug Links
                  </Label>
                  <Switch
                    id="debugMode"
                    checked={debugMode}
                    onCheckedChange={setDebugMode}
                  />
                </div>

                {/* Display настройки */}
                <div className="space-y-3 pt-2 border-t">
                  <div className="text-sm font-medium">Display</div>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="showArrows" className="cursor-pointer">
                      Arrows
                    </Label>
                    <Switch
                      id="showArrows"
                      checked={graphSettings.showArrows}
                      onCheckedChange={(checked) =>
                        updateGraphSettings({ showArrows: checked })
                      }
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Text fade threshold</Label>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(graphSettings.textFadeThreshold * 100)}%
                      </span>
                    </div>
                    <Slider
                      value={[graphSettings.textFadeThreshold]}
                      onValueChange={([value]) =>
                        updateGraphSettings({ textFadeThreshold: value })
                      }
                      min={0}
                      max={1}
                      step={0.01}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Node size</Label>
                      <span className="text-xs text-muted-foreground">
                        {graphSettings.nodeSize}
                      </span>
                    </div>
                    <Slider
                      value={[graphSettings.nodeSize]}
                      onValueChange={([value]) =>
                        updateGraphSettings({ nodeSize: value })
                      }
                      min={2}
                      max={15}
                      step={0.5}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Link thickness</Label>
                      <span className="text-xs text-muted-foreground">
                        {graphSettings.linkThickness}
                      </span>
                    </div>
                    <Slider
                      value={[graphSettings.linkThickness]}
                      onValueChange={([value]) =>
                        updateGraphSettings({ linkThickness: value })
                      }
                      min={0.5}
                      max={5}
                      step={0.1}
                    />
                  </div>

                  {/* Кнопки управления */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAnimate}
                      className="flex-1"
                    >
                      <Play className="mr-2 h-4 w-4" />
                      Animate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleUnpinAll}
                      className="flex-1"
                    >
                      Unpin All
                    </Button>
                  </div>
                </div>

                {/* Forces настройки */}
                <div className="space-y-3 pt-2 border-t">
                  <div className="text-sm font-medium">Forces</div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Center force</Label>
                      <span className="text-xs text-muted-foreground">
                        {graphSettings.centerForce.toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      value={[graphSettings.centerForce]}
                      onValueChange={([value]) =>
                        updateGraphSettings({ centerForce: value })
                      }
                      min={0}
                      max={1}
                      step={0.01}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Repel force</Label>
                      <span className="text-xs text-muted-foreground">
                        {graphSettings.repelForce}
                      </span>
                    </div>
                    <Slider
                      value={[graphSettings.repelForce]}
                      onValueChange={([value]) =>
                        updateGraphSettings({ repelForce: value })
                      }
                      min={-500}
                      max={0}
                      step={10}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Link force</Label>
                      <span className="text-xs text-muted-foreground">
                        {graphSettings.linkForce.toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      value={[graphSettings.linkForce]}
                      onValueChange={([value]) =>
                        updateGraphSettings({ linkForce: value })
                      }
                      min={0}
                      max={2}
                      step={0.1}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Link distance</Label>
                      <span className="text-xs text-muted-foreground">
                        {graphSettings.linkDistance}
                      </span>
                    </div>
                    <Slider
                      value={[graphSettings.linkDistance]}
                      onValueChange={([value]) =>
                        updateGraphSettings({ linkDistance: value })
                      }
                      min={20}
                      max={300}
                      step={5}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </div>

      {/* Граф */}
      <div 
        ref={graphWrapperRef}
        className="flex-1 relative bg-black overflow-hidden"
        style={{ cursor: isDragging ? 'grabbing' : 'default' }}
      >
        {/* Debug панель */}
        {debugMode && (hoveredNodeId || selectedNodeId) && (() => {
          const debugNodeId = selectedNodeId || hoveredNodeId;
          const debugNote = notes.find(n => n.id === debugNodeId);
          if (!debugNote) return null;

          // Извлекаем все links из note
          const rawLinks: string[] = [];
          if (debugNote.links.length > 0) {
            rawLinks.push(...debugNote.links);
          } else if (debugNote.body && !debugNote.folder.startsWith('_') && !EXCLUDED_FOLDERS.includes(debugNote.folder)) {
            // Fallback парсинг
            const extracted = extractWikilinks(debugNote.body);
            rawLinks.push(...extracted);
          }

          // Создаём debug информацию
          const debugInfo = rawLinks.map(raw => {
            const normalized = normalizeWikilinkTarget(raw) || raw;
            const resolved = getNoteByTitle(normalized);
            return {
              raw,
              normalized,
              resolved: resolved ? resolved.title : 'NOT FOUND',
              found: !!resolved,
            };
          });

          return (
            <div className="absolute bottom-4 right-4 w-96 bg-background border rounded-lg shadow-lg p-4 z-10 max-h-96 overflow-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Links Debug</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {
                    setSelectedNodeId(null);
                    setHoveredNodeId(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-xs mb-2 text-muted-foreground">
                Node: <span className="font-mono">{debugNote.title}</span>
              </div>
              <div className="space-y-2">
                {debugInfo.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No links found</div>
                ) : (
                  debugInfo.map((info, idx) => (
                    <div key={idx} className="text-xs border-b pb-2 last:border-0">
                      <div className="font-mono text-muted-foreground">{info.raw}</div>
                      <div className="text-muted-foreground">→ {info.normalized}</div>
                      <div className={info.found ? 'text-green-600' : 'text-red-600'}>
                        → {info.resolved}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })()}

        {filteredData.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Нет данных для отображения
          </div>
        ) : usePixiGraph ? (
          <PixiGraphView
            nodes={filteredData.nodes}
            edges={filteredData.links}
            onNodeClick={(nodeId) => {
              updateGraphSettings({ selectedNodeId: nodeId });
              setSelectedNodeId(nodeId);
              openNote(nodeId);
            }}
            onNodeHover={(nodeId) => {
              setHoveredNodeId(nodeId);
            }}
          />
        ) : (
          <ForceGraph2D
            ref={fgRef}
            graphData={filteredData}
            nodeLabel={(node: any) => node.title}
            nodeColor={(node: any) => getNodeColor(node)}
            nodeVal={(node: any) => getNodeSize(node)}
            linkColor={(link: any) => getLinkColor(link)}
            linkWidth={(link: any) => getLinkWidth(link)}
            linkDirectionalArrowLength={graphSettings.showArrows ? 6 : 0}
            linkDirectionalArrowRelPos={1}
            linkDirectionalArrowColor={(link: any) => getLinkColor(link)}
            onZoom={(zoom: any) => {
              if (zoom && zoom.k !== undefined) {
                setGlobalScale(zoom.k);
              }
            }}
            linkCurvature={0.1}
            cooldownTicks={cooldownTicks}
            enableNodeDrag={true}
            onNodeDrag={() => {
              setIsDragging(true);
              
              const fg = fgRef.current;
              if (fg) {
                // При drag даём немного больше времени симуляции
                setCooldownTicks(60);
                fg.d3ReheatSimulation();
              }
            }}
            onNodeDragEnd={(node: any) => {
              setIsDragging(false);

              // Obsidian-like: "прикалываем" перетащенную ноду
              if (node) {
                node.fx = node.x;
                node.fy = node.y;
              }

              // Даём системе мягко "досесть"
              settleSimulation();
            }}
            onNodeHover={(node: any) => {
              setHoveredNodeId(node ? node.id : null);
              // Управление курсором
              if (graphWrapperRef.current) {
                graphWrapperRef.current.style.cursor = node ? 'pointer' : 'default';
              }
            }}
            onBackgroundClick={() => {
              setSelectedNodeId(null);
              updateGraphSettings({ selectedNodeId: null });
            }}
            nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
              const threshold = graphSettings.textFadeThreshold;
              const s = globalScale;
              const baseNodeSize = node.__size || getNodeSize(node);
              const isHighlighted = highlightNodes.has(node.id);
              const isHovered = node.id === hoveredNodeId;
              const isSelected = node.id === selectedNodeId || node.id === graphSettings.selectedNodeId;
              const isNeighbor = isHighlighted && !isHovered;

              // Визуальное увеличение ноды при hover
              let visualNodeSize = baseNodeSize;
              if (isHovered) {
                visualNodeSize = baseNodeSize * 1.2; // +20% для hovered
              } else if (isNeighbor) {
                visualNodeSize = baseNodeSize * 1.1; // +10% для соседей
              }

              const x = node.x || 0;
              const y = node.y || 0;

              ctx.save();

              // 1. Glow для hovered ноды (минимализм, Obsidian-like)
              if (isHovered && x !== undefined && y !== undefined) {
                const glowRadius = visualNodeSize + 6;
                const gradient = ctx.createRadialGradient(x, y, visualNodeSize, x, y, glowRadius);
                gradient.addColorStop(0, 'rgba(255, 255, 255, 0.10)');
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(x, y, glowRadius, 0, 2 * Math.PI);
                ctx.fill();
              }

              // 2. Glow для selected ноды (ещё слабее, Obsidian-like)
              if (isSelected && !isHovered && x !== undefined && y !== undefined) {
                const glowRadius = visualNodeSize + 5;
                const gradient = ctx.createRadialGradient(x, y, visualNodeSize, x, y, glowRadius);
                gradient.addColorStop(0, 'rgba(255, 255, 255, 0.06)');
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(x, y, glowRadius, 0, 2 * Math.PI);
                ctx.fill();
              }

              // 3. Ring (тонкое кольцо) для hovered
              if (isHovered && x !== undefined && y !== undefined) {
                ctx.beginPath();
                ctx.arc(x, y, visualNodeSize + 2, 0, 2 * Math.PI);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
              }

              // 4. Ring для соседей
              if (isNeighbor && x !== undefined && y !== undefined) {
                ctx.beginPath();
                ctx.arc(x, y, visualNodeSize + 2, 0, 2 * Math.PI);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.lineWidth = 1;
                ctx.stroke();
              }

              // 5. Ring для selected (если не hovered)
              if (isSelected && !isHovered && x !== undefined && y !== undefined) {
                ctx.beginPath();
                ctx.arc(x, y, visualNodeSize + 2, 0, 2 * Math.PI);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
                ctx.lineWidth = 1;
                ctx.stroke();
              }

              ctx.restore();

              // 6. Текст/лейблы (Obsidian-like LOD: 3 режима по zoom)
              // s < 0.55: не показывать вообще
              // 0.55 <= s < 0.95: только hovered/selected
              // s >= 0.95: всё highlighted (как сейчас)
              const shouldShowLabel =
                s >= 0.95 ? (!hoveredNodeId || isHighlighted || isSelected || isHovered) :
                s >= 0.55 ? (isHovered || isSelected) :
                false;
              
              if (shouldShowLabel) {
                const fadeRange = 0.4;
                const alpha = Math.min(1, Math.max(0, (s - threshold) / fadeRange));
                const label = node.title;
                const fontSize = Math.max(8, Math.min(18, 14 / s));

                ctx.save();
                ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';

                // Позиция: справа-вверх от ноды
                const labelX = x + visualNodeSize + 6;
                const labelY = y - visualNodeSize - 6;

                // Измеряем текст для фона
                const metrics = ctx.measureText(label);
                const textWidth = metrics.width;
                const textHeight = fontSize;
                const padding = 4;
                const cornerRadius = 4;

                // Рисуем фон-плашку (скругленный прямоугольник)
                const rectX = labelX - padding;
                const rectY = labelY - textHeight / 2 - padding;
                const rectW = textWidth + padding * 2;
                const rectH = textHeight + padding * 2;
                ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.35})`;
                ctx.beginPath();
                ctx.moveTo(rectX + cornerRadius, rectY);
                ctx.lineTo(rectX + rectW - cornerRadius, rectY);
                ctx.quadraticCurveTo(rectX + rectW, rectY, rectX + rectW, rectY + cornerRadius);
                ctx.lineTo(rectX + rectW, rectY + rectH - cornerRadius);
                ctx.quadraticCurveTo(rectX + rectW, rectY + rectH, rectX + rectW - cornerRadius, rectY + rectH);
                ctx.lineTo(rectX + cornerRadius, rectY + rectH);
                ctx.quadraticCurveTo(rectX, rectY + rectH, rectX, rectY + rectH - cornerRadius);
                ctx.lineTo(rectX, rectY + cornerRadius);
                ctx.quadraticCurveTo(rectX, rectY, rectX + cornerRadius, rectY);
                ctx.closePath();
                ctx.fill();

                // Рисуем текст (белый с черной обводкой)
                ctx.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.7})`;
                ctx.lineWidth = 2;
                ctx.strokeText(label, labelX, labelY);
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.fillText(label, labelX, labelY);

                ctx.restore();
              }
            }}
            nodeCanvasObjectMode={() => 'after'}
            onNodeClick={(node: any) => {
              updateGraphSettings({ selectedNodeId: node.id });
              setSelectedNodeId(node.id);
              openNote(node.id);
            }}
          />
        )}
      </div>
    </div>
  );
}
