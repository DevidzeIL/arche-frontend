import { useLayoutEffect, useRef, useState } from 'react';
import type { KnowledgeGraph, KnowledgeNode } from '@/arche/knowledge';
import { RELATION_META } from '@/arche/relations';
import { noteTypeLabel, noteTypeMeta } from '@/arche/noteTypes';
import { formatYear } from '@/arche/timeSpan';
import { firstImageOf } from '@/arche/images';
import { excerptOf } from '@/arche/excerpt';

const OFFSET = 16;
const MAX_RELATIONS = 4;

interface NodeHoverCardProps {
  graph: KnowledgeGraph;
  node: KnowledgeNode;
  /** Координаты курсора в системе окна */
  position: { x: number; y: number };
}

/**
 * Карточка рядом с курсором. Раньше подсказка висела по центру сверху —
 * приходилось переводить взгляд через весь экран и обратно.
 */
export function NodeHoverCard({ graph, node, position }: NodeHoverCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState({ left: position.x + OFFSET, top: position.y + OFFSET });

  // Держим карточку внутри окна: у правого и нижнего края переворачиваем
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const { width, height } = element.getBoundingClientRect();
    const left =
      position.x + OFFSET + width > window.innerWidth
        ? Math.max(8, position.x - OFFSET - width)
        : position.x + OFFSET;
    const top =
      position.y + OFFSET + height > window.innerHeight
        ? Math.max(8, position.y - OFFSET - height)
        : position.y + OFFSET;

    setPlacement({ left, top });
  }, [position.x, position.y, node.id]);

  const time = node.time;
  const period = time
    ? time.endYear !== undefined
      ? `${formatYear(time.startYear, time.precision)} — ${formatYear(time.endYear, time.precision)}`
      : formatYear(time.startYear, time.precision)
    : 'вне времени';

  const image = firstImageOf(node.note.body);

  // Показываем самые содержательные связи, а не первые попавшиеся
  const relations = [...(graph.adjacent.get(node.id) ?? [])]
    .filter((e) => e.labels.length > 0)
    .sort((a, b) => RELATION_META[b.kind].weight - RELATION_META[a.kind].weight)
    .slice(0, MAX_RELATIONS);

  const summary = excerptOf(node.note, 200);

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed z-30 w-[340px] overflow-hidden rounded-lg border border-border/60 bg-card/97 shadow-2xl backdrop-blur-sm"
      style={{ left: placement.left, top: placement.top }}
      role="tooltip"
    >
      <div className="flex gap-3 p-3">
        {image && (
          <img src={image} alt="" className="h-20 w-20 shrink-0 rounded object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <p className="break-words font-serif text-[17px] leading-tight">{node.title}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: noteTypeMeta(node.type).graphColor }}
              aria-hidden
            />
            {noteTypeLabel(node.type)} · {period}
          </p>
          {summary && (
            <p className="mt-1.5 line-clamp-3 text-[13px] leading-snug text-muted-foreground">
              {summary}
            </p>
          )}
        </div>
      </div>

      {relations.length > 0 && (
        <ul className="space-y-1 border-t border-border/40 bg-background/40 px-3 py-2">
          {relations.map((edge) => {
            const otherId = edge.sourceId === node.id ? edge.targetId : edge.sourceId;
            const other = graph.nodeById.get(otherId);
            const meta = RELATION_META[edge.kind];
            const outgoing = edge.sourceId === node.id;

            return (
              <li key={edge.id} className="flex items-baseline gap-1.5 text-[12px] leading-snug">
                <span className="shrink-0 font-medium" style={{ color: meta.color }}>
                  {outgoing ? '→' : '←'} {meta.label}
                </span>
                <span className="min-w-0 break-words text-muted-foreground">{other?.title}</span>
              </li>
            );
          })}
        </ul>
      )}

      <p className="border-t border-border/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        Клик — почему возник · двойной клик — открыть
      </p>
    </div>
  );
}
