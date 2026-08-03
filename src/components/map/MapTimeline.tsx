import { useEffect, useMemo, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import type { KnowledgeGraph, KnowledgeNode } from '@/arche/knowledge';
import { RELATION_META } from '@/arche/relations';
import { noteTypeLabel, noteTypeMeta } from '@/arche/noteTypes';
import { formatYear } from '@/arche/timeSpan';
import { excerptOf } from '@/arche/excerpt';
import { cn } from '@/lib/utils';

interface MapTimelineProps {
  graph: KnowledgeGraph;
  /** Уже отфильтрованные узлы — те же, что попали бы на схему */
  nodes: KnowledgeNode[];
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
}

interface Section {
  key: string;
  title: string;
  period: string;
  /** Заметка эпохи, если раздел ей соответствует */
  epochId?: string;
  items: KnowledgeNode[];
}

/** Сколько следствий показывать в строке «ведёт к» */
const CONSEQUENCES = 3;

/**
 * Лента времени — то же содержимое карты, развёрнутое сверху вниз.
 *
 * Схема отвечает на «из чего возникло» одним взглядом, но для этого ей
 * нужна ширина. На телефоне ширины нет, и та же схема превращается
 * в наложенные друг на друга точки. Лента отказывается от одновременного
 * обзора и взамен даёт то, что на узком экране работает: порядок, эпохи
 * разделами и по одной понятной строке про каждый узел.
 *
 * Разбор «почему» остаётся общим — тап открывает ту же панель, что и на схеме.
 */
export function MapTimeline({ graph, nodes, selectedId, onSelect }: MapTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const sections = useMemo<Section[]>(() => {
    // Эпохи берём из полного графа, а не из отфильтрованных узлов:
    // это каркас ленты, и он не должен исчезать вместе с фильтром по типу
    const epochs = graph.nodes
      .filter((n) => n.type === 'time' && n.time?.endYear !== undefined)
      .sort((a, b) => a.time!.startYear - b.time!.startYear);

    const buckets = new Map<string, Section>();
    const before: Section = { key: 'before', title: 'Раньше', period: '', items: [] };

    for (const epoch of epochs) {
      buckets.set(epoch.id, {
        key: epoch.id,
        title: epoch.title,
        period: `${formatYear(epoch.time!.startYear, epoch.time!.precision)} — ${formatYear(
          epoch.time!.endYear!,
          epoch.time!.precision
        )}`,
        epochId: epoch.id,
        items: [],
      });
    }

    const sorted = [...nodes]
      .filter((n) => n.time)
      .sort((a, b) => a.time!.displayYear - b.time!.displayYear);

    for (const node of sorted) {
      const year = node.time!.displayYear;
      // Последняя эпоха, которая уже началась: эпохи в этом хранилище
      // соприкасаются краями, и попадание «между» разбиралось бы дольше,
      // чем того стоит
      let target: Section | null = null;
      for (const epoch of epochs) {
        if (epoch.time!.startYear <= year) target = buckets.get(epoch.id) ?? null;
        else break;
      }
      // Сама эпоха — это заголовок раздела, повторять её в списке незачем
      if (target?.epochId === node.id) continue;
      (target ?? before).items.push(node);
    }

    return [before, ...buckets.values()].filter((s) => s.items.length > 0);
  }, [graph, nodes]);

  /** Куда ведёт узел — по тем же причинным связям, что рисует схема */
  const consequencesOf = useMemo(() => {
    const cache = new Map<string, string[]>();
    return (nodeId: string): string[] => {
      const cached = cache.get(nodeId);
      if (cached) return cached;

      const titles = (graph.forward.get(nodeId) ?? [])
        .filter((e) => RELATION_META[e.kind].genealogical && !e.undirected)
        .sort((a, b) => RELATION_META[b.kind].weight - RELATION_META[a.kind].weight)
        .map((e) => graph.nodeById.get(e.targetId)?.title)
        .filter((t): t is string => Boolean(t))
        .slice(0, CONSEQUENCES);

      cache.set(nodeId, titles);
      return titles;
    };
  }, [graph]);

  // Выбранный узел мог прийти из ссылки или из панели — подтягиваем его в вид
  useEffect(() => {
    if (!selectedId) return;
    const target = scrollRef.current?.querySelector(`[data-node-id="${CSS.escape(selectedId)}"]`);
    target?.scrollIntoView({ block: 'center' });
  }, [selectedId]);

  if (sections.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Под выбранные фильтры ничего не попало.
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain">
      <div className="mx-auto max-w-2xl px-3 pb-24 pt-2">
        {sections.map((section) => (
          <section key={section.key}>
            <header className="sticky top-0 z-10 -mx-3 mb-2 border-b border-border/40 bg-background/95 px-3 py-2 backdrop-blur-sm">
              {section.epochId ? (
                <button
                  type="button"
                  onClick={() => onSelect(section.epochId!)}
                  className="text-left"
                >
                  <h2 className="font-serif text-lg leading-tight">{section.title}</h2>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {section.period}
                  </p>
                </button>
              ) : (
                <h2 className="font-serif text-lg leading-tight text-muted-foreground">
                  {section.title}
                </h2>
              )}
            </header>

            <ul className="mb-4 space-y-1.5">
              {section.items.map((node) => {
                const meta = noteTypeMeta(node.type);
                const next = consequencesOf(node.id);
                const selected = node.id === selectedId;

                return (
                  <li key={node.id}>
                    <button
                      type="button"
                      data-node-id={node.id}
                      onClick={() => onSelect(node.id)}
                      className={cn(
                        'flex w-full gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                        selected
                          ? 'border-primary/60 bg-primary/5'
                          : 'border-border/40 bg-card/40 active:bg-accent/50'
                      )}
                    >
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={{ background: meta.graphColor }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-serif text-[15px] leading-snug">
                          {node.title}
                        </span>
                        <span className="mt-0.5 block text-[11px] uppercase tracking-wider text-muted-foreground">
                          {noteTypeLabel(node.type)} ·{' '}
                          {formatYear(node.time!.displayYear, node.time!.precision)}
                        </span>
                        {/* Без block: line-clamp сам задаёт display, и вместе они спорят */}
                        <span className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
                          {excerptOf(node.note, 140)}
                        </span>
                        {next.length > 0 && (
                          <span className="mt-1.5 flex items-start gap-1 text-[12px] text-foreground/60">
                            <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                            <span className="min-w-0">{next.join(' · ')}</span>
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
