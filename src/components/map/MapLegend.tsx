import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { RELATION_KINDS, RELATION_META, type RelationKind } from '@/arche/relations';
import { NOTE_TYPE_META, domainLabel } from '@/arche/noteTypes';
import { cn } from '@/lib/utils';

/** Порядок в легенде: сначала причинные связи, навигационные — в конце */
const LEGEND_ORDER: RelationKind[] = [...RELATION_KINDS].sort(
  (a, b) => RELATION_META[b].weight - RELATION_META[a].weight
);

interface MapLegendProps {
  activeKinds: Set<RelationKind>;
  onToggleKind: (kind: RelationKind) => void;
  availableTypes: string[];
  activeTypes: string[];
  onToggleType: (type: string) => void;
  availableDomains: string[];
  activeDomains: string[];
  onToggleDomain: (domain: string) => void;
  onReset: () => void;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
        active
          ? 'border-foreground/25 text-foreground'
          : 'border-transparent text-muted-foreground/60 hover:text-muted-foreground'
      )}
    >
      {children}
    </button>
  );
}

export function MapLegend({
  activeKinds,
  onToggleKind,
  availableTypes,
  activeTypes,
  onToggleType,
  availableDomains,
  activeDomains,
  onToggleDomain,
  onReset,
}: MapLegendProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute left-3 bottom-12 z-20 max-w-[min(92vw,420px)] rounded-lg border border-border/60 bg-card/95 backdrop-blur-sm text-xs">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2"
      >
        <span className="flex items-center gap-1.5 text-muted-foreground">
          Связи и фильтры
          <span className="text-foreground/70">{activeKinds.size}/{LEGEND_ORDER.length}</span>
        </span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-border/40 px-3 py-3">
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Типы связей</p>
            <div className="flex flex-wrap gap-1">
              {LEGEND_ORDER.map((kind) => {
                const meta = RELATION_META[kind];
                const active = activeKinds.has(kind);
                return (
                  <Chip key={kind} active={active} onClick={() => onToggleKind(kind)}>
                    <span
                      className="h-0.5 w-3 rounded-full"
                      style={{ background: meta.color, opacity: active ? 1 : 0.4 }}
                      aria-hidden
                    />
                    {meta.label}
                  </Chip>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Типы заметок</p>
            <div className="flex flex-wrap gap-1">
              {availableTypes.map((type) => {
                const active = activeTypes.length === 0 || activeTypes.includes(type);
                const meta = NOTE_TYPE_META[type as keyof typeof NOTE_TYPE_META];
                return (
                  <Chip key={type} active={active} onClick={() => onToggleType(type)}>
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: meta?.graphColor ?? '#6b7280', opacity: active ? 1 : 0.4 }}
                      aria-hidden
                    />
                    {meta?.pluralLabel ?? type}
                  </Chip>
                );
              })}
            </div>
          </div>

          {availableDomains.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Домены</p>
              <div className="flex flex-wrap gap-1">
                {availableDomains.map((domain) => (
                  <Chip
                    key={domain}
                    active={activeDomains.length === 0 || activeDomains.includes(domain)}
                    onClick={() => onToggleDomain(domain)}
                  >
                    {domainLabel(domain)}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onReset}
            className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Сбросить всё
          </button>
        </div>
      )}
    </div>
  );
}
