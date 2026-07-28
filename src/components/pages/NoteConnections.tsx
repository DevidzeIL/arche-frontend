import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Compass, CornerDownLeft } from 'lucide-react';
import { useArcheStore } from '@/arche/state/store';
import { traceGenealogy } from '@/arche/knowledge';
import { RELATION_META } from '@/arche/relations';
import { Button } from '@/components/ui/button';
import { TypeBadge } from '@/components/museum';
import type { ArcheNote } from '@/arche/types';

interface NoteConnectionsProps {
  note: ArcheNote;
}

/**
 * Блок связей на странице заметки: обратные ссылки и краткая родословная.
 * Раньше показывались только исходящие ссылки — половина навигации по вики
 * была недоступна, хотя данные для неё уже считались.
 */
export function NoteConnections({ note }: NoteConnectionsProps) {
  const graph = useArcheStore((state) => state.knowledgeGraph);
  const getBacklinks = useArcheStore((state) => state.getBacklinks);
  const navigate = useNavigate();

  const backlinks = getBacklinks(note.id);

  const genealogy = useMemo(() => {
    if (!graph.nodeById.has(note.id)) return null;
    return { graph, trace: traceGenealogy(graph, note.id, 1) };
  }, [graph, note.id]);

  const ancestors = genealogy?.trace.ancestors ?? [];
  const descendants = genealogy?.trace.descendants ?? [];

  if (backlinks.length === 0 && ancestors.length === 0 && descendants.length === 0) {
    return null;
  }

  return (
    <section className="space-y-6 border-t border-border/30 pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-2xl text-foreground/90">Связи</h2>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/timeline?focus=${encodeURIComponent(note.id)}`}>
            <Compass className="mr-1.5 h-3.5 w-3.5" />
            Показать на карте
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {ancestors.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Возникло из
            </h3>
            <ul className="space-y-2">
              {ancestors.map((step) => {
                const target = genealogy!.graph.nodeById.get(step.nodeId);
                if (!target) return null;
                return (
                  <li key={step.edge.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/note/${target.id}`)}
                      className="text-left"
                    >
                      <span className="font-serif hover:underline">{target.title}</span>
                      {step.edge.labels[0] && (
                        <span className="block text-xs text-muted-foreground">
                          <span style={{ color: RELATION_META[step.edge.kind].color }}>
                            {RELATION_META[step.edge.kind].label}
                          </span>{' '}
                          — {step.edge.labels[0]}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {descendants.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Привело к
            </h3>
            <ul className="space-y-2">
              {descendants.map((step) => {
                const target = genealogy!.graph.nodeById.get(step.nodeId);
                if (!target) return null;
                return (
                  <li key={step.edge.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/note/${target.id}`)}
                      className="text-left"
                    >
                      <span className="font-serif hover:underline">{target.title}</span>
                      {step.edge.labels[0] && (
                        <span className="block text-xs text-muted-foreground">
                          <span style={{ color: RELATION_META[step.edge.kind].color }}>
                            {RELATION_META[step.edge.kind].label}
                          </span>{' '}
                          — {step.edge.labels[0]}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {backlinks.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            <CornerDownLeft className="h-3 w-3" />
            Сюда ссылаются · {backlinks.length}
          </h3>
          <div className="flex flex-wrap gap-2">
            {backlinks.map((source) => (
              <button
                key={source.id}
                type="button"
                onClick={() => navigate(`/note/${source.id}`)}
                className="inline-flex items-center gap-2 rounded-full border border-border/40 px-3 py-1 text-sm transition-colors hover:border-border hover:bg-accent/50"
              >
                <span className="font-serif">{source.title}</span>
                <TypeBadge type={source.type} className="scale-90" />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
