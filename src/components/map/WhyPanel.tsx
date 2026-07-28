import { ArrowRight, ArrowLeft, X, Route, ExternalLink, Users } from 'lucide-react';
import type { KnowledgeEdge, KnowledgeGraph, Genealogy, PathResult } from '@/arche/knowledge';
import { RELATION_META, type RelationKind } from '@/arche/relations';
import { noteTypeLabel } from '@/arche/noteTypes';
import { formatYear } from '@/arche/timeSpan';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface WhyPanelProps {
  graph: KnowledgeGraph;
  nodeId: string;
  genealogy: Genealogy;
  path: PathResult | null;
  pathFromId: string | null;
  onSelect: (nodeId: string) => void;
  onOpen: (nodeId: string) => void;
  onStartPath: () => void;
  onClearPath: () => void;
  onClose: () => void;
}

function yearLabel(graph: KnowledgeGraph, nodeId: string): string {
  const time = graph.nodeById.get(nodeId)?.time;
  if (!time) return '';
  return formatYear(time.startYear, time.precision);
}

interface StepListProps {
  graph: KnowledgeGraph;
  steps: Array<{ edge: KnowledgeEdge; nodeId: string; depth: number }>;
  onSelect: (nodeId: string) => void;
}

function StepList({ graph, steps, onSelect }: StepListProps) {
  return (
    <ul className="space-y-1.5">
      {steps.map((step) => {
        const node = graph.nodeById.get(step.nodeId);
        if (!node) return null;
        const meta = RELATION_META[step.edge.kind];

        return (
          <li key={`${step.edge.id}-${step.nodeId}`}>
            <button
              type="button"
              onClick={() => onSelect(step.nodeId)}
              className="w-full text-left rounded-md px-2 py-1.5 hover:bg-accent/60 transition-colors group"
              style={{ marginLeft: (step.depth - 1) * 10 }}
            >
              <span className="flex items-baseline gap-2">
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0 translate-y-[-1px]"
                  style={{ background: meta.color }}
                  aria-hidden
                />
                <span className="text-sm font-serif group-hover:underline">{node.title}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {yearLabel(graph, step.nodeId)}
                </span>
              </span>
              {step.edge.labels[0] && (
                <span className="block text-xs text-muted-foreground pl-3.5 leading-snug">
                  {step.edge.labels[0]}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Section({
  title,
  hint,
  icon,
  children,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <h3 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
        {hint && <span className="normal-case tracking-normal opacity-70">· {hint}</span>}
      </h3>
      {children}
    </section>
  );
}

export function WhyPanel({
  graph,
  nodeId,
  genealogy,
  path,
  pathFromId,
  onSelect,
  onOpen,
  onStartPath,
  onClearPath,
  onClose,
}: WhyPanelProps) {
  const node = graph.nodeById.get(nodeId);
  if (!node) return null;

  const time = node.time;
  const period = time
    ? time.endYear !== undefined
      ? `${formatYear(time.startYear, time.precision)} — ${formatYear(time.endYear, time.precision)}`
      : formatYear(time.startYear, time.precision)
    : 'вне времени';

  // Противостояние показываем отдельно: это не «откуда» и не «куда»,
  // а напряжение, из которого обычно и рождается следующий шаг
  const opposing = (graph.adjacent.get(nodeId) ?? []).filter((e) => e.kind === 'opposes');
  const ancestors = genealogy.ancestors.filter((s) => s.edge.kind !== 'opposes');
  const descendants = genealogy.descendants.filter((s) => s.edge.kind !== 'opposes');

  return (
    <aside className="absolute right-0 top-0 bottom-0 w-full sm:w-[360px] bg-card/95 backdrop-blur-sm border-l border-border/60 flex flex-col z-20">
      <header className="p-4 border-b border-border/40 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-xl font-serif leading-tight">{node.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {noteTypeLabel(node.type)} · {period}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Закрыть панель">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onOpen(nodeId)} className="flex-1">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Открыть
          </Button>
          {pathFromId === nodeId ? (
            <Button size="sm" variant="secondary" onClick={onClearPath} className="flex-1">
              Отменить путь
            </Button>
          ) : path && pathFromId ? (
            <Button size="sm" variant="secondary" onClick={onClearPath} className="flex-1">
              Сбросить путь
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onStartPath} className="flex-1">
              <Route className="h-3.5 w-3.5 mr-1.5" />
              Путь отсюда
            </Button>
          )}
        </div>

        {pathFromId === nodeId && !path && (
          <p className="text-xs text-muted-foreground">
            Выберите вторую заметку — построю цепочку между ними.
          </p>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {path && path.edges.length > 0 && (
          <Section title="Цепочка" icon={<Route className="h-3 w-3" />}>
            <ol className="space-y-1">
              {path.nodeIds.map((id, index) => {
                const stepNode = graph.nodeById.get(id);
                const edge = path.edges[index];
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => onSelect(id)}
                      className="text-sm font-serif hover:underline text-left"
                    >
                      {stepNode?.title}
                    </button>
                    {edge && (
                      <div className="flex items-baseline gap-1.5 pl-2 py-0.5 text-xs text-muted-foreground">
                        <span
                          className="h-3 w-px shrink-0"
                          style={{ background: RELATION_META[edge.kind].color }}
                          aria-hidden
                        />
                        <span style={{ color: RELATION_META[edge.kind].color }}>
                          {RELATION_META[edge.kind].label}
                        </span>
                        {edge.labels[0] && <span className="opacity-80">— {edge.labels[0]}</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </Section>
        )}

        {ancestors.length > 0 && (
          <Section
            title="Возникло из"
            hint={`${ancestors.length}`}
            icon={<ArrowLeft className="h-3 w-3" />}
          >
            <StepList graph={graph} steps={ancestors} onSelect={onSelect} />
          </Section>
        )}

        {descendants.length > 0 && (
          <Section
            title="Привело к"
            hint={`${descendants.length}`}
            icon={<ArrowRight className="h-3 w-3" />}
          >
            <StepList graph={graph} steps={descendants} onSelect={onSelect} />
          </Section>
        )}

        {opposing.length > 0 && (
          <Section title="Противостоит" icon={<span className="text-[10px]">⚔</span>}>
            <StepList
              graph={graph}
              steps={opposing.map((edge) => ({
                edge,
                nodeId: edge.sourceId === nodeId ? edge.targetId : edge.sourceId,
                depth: 1,
              }))}
              onSelect={onSelect}
            />
          </Section>
        )}

        {genealogy.contemporaries.length > 0 && (
          <Section title="Современники" icon={<Users className="h-3 w-3" />}>
            <StepList graph={graph} steps={genealogy.contemporaries} onSelect={onSelect} />
          </Section>
        )}

        {ancestors.length === 0 && descendants.length === 0 && (
          <p className={cn('text-sm text-muted-foreground')}>
            У этой заметки пока нет причинных связей. Добавьте в раздел «Связи» ссылки
            с описанием — например «то, от чего происходит переход» или «ответ на кризис».
          </p>
        )}
      </div>
    </aside>
  );
}

export type { RelationKind };
