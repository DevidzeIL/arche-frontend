import { useMemo, useState } from 'react';
import { Search, X, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ArcheNote } from '@/arche/types';
import { NOTE_TYPE_META, NOTE_TYPES_ORDERED, domainLabel } from '@/arche/noteTypes';
import { collectDomains, collectTypes, hasActiveFilters, EMPTY_FILTERS, type NoteFilters } from '@/arche/search';

interface FilterChipProps {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

/** Настоящая кнопка с aria-pressed: чипы фильтров должны быть доступны с клавиатуры */
function FilterChip({ selected, onClick, children }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
        selected
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground hover:border-foreground/30'
      )}
    >
      {children}
    </button>
  );
}

interface SearchAndFilterProps {
  notes: ArcheNote[];
  filters: NoteFilters;
  onFiltersChange: (filters: NoteFilters) => void;
  /** Сколько заметок осталось после фильтрации — считает родитель */
  resultCount: number;
  className?: string;
}

/** Пустое поле — граница не задана, а не ноль */
function parseYear(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Готовые периоды: набирать «-800» и «500» руками ради обычного вопроса
 * «покажи античность» никто не будет. Границы совпадают с эпохами хранилища.
 */
const PERIODS = [
  { label: 'Античность', from: -800, to: 500 },
  { label: 'Средневековье', from: 500, to: 1400 },
  { label: 'Возрождение', from: 1400, to: 1600 },
  { label: 'Новое время', from: 1600, to: 1800 },
  { label: 'XIX век', from: 1800, to: 1900 },
  { label: 'XX век', from: 1900, to: 2000 },
];

/**
 * Контролируемый компонент: фильтры живут у родителя.
 * Раньше он держал состояние сам и «поднимал» результат наверх через useEffect —
 * лишний рендер-цикл и источник рассинхрона.
 */
export function SearchAndFilter({
  notes,
  filters,
  onFiltersChange,
  resultCount,
  className,
}: SearchAndFilterProps) {
  const [showFilters, setShowFilters] = useState(false);

  const availableTypes = useMemo(() => {
    const present = new Set(collectTypes(notes));
    return NOTE_TYPES_ORDERED.filter((type) => present.has(type));
  }, [notes]);

  const availableDomains = useMemo(() => collectDomains(notes), [notes]);

  const toggle = (key: 'types' | 'domains', value: string) => {
    const current = filters[key];
    onFiltersChange({
      ...filters,
      [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    });
  };

  const active = hasActiveFilters(filters);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Поиск */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          placeholder="Поиск по названию, тексту или домену..."
          aria-label="Поиск по заметкам"
          value={filters.query}
          onChange={(e) => onFiltersChange({ ...filters, query: e.target.value })}
          className="pl-10 pr-10"
        />
        {filters.query && (
          <button
            type="button"
            onClick={() => onFiltersChange({ ...filters, query: '' })}
            aria-label="Очистить поиск"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Кнопка фильтров (мобильная) */}
      <div className="flex items-center justify-between md:hidden">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
          className="w-full"
        >
          <Filter className="h-4 w-4 mr-2" aria-hidden />
          Фильтры
          {active && (
            <Badge variant="secondary" className="ml-2">
              {filters.types.length +
                filters.domains.length +
                (filters.fromYear !== null || filters.toYear !== null ? 1 : 0)}
            </Badge>
          )}
        </Button>
        {active && (
          <Button variant="ghost" size="sm" onClick={() => onFiltersChange(EMPTY_FILTERS)} className="ml-2">
            Сбросить
          </Button>
        )}
      </div>

      {/* Панель фильтров */}
      <div className={cn('space-y-4 border rounded-lg p-4 bg-card', showFilters ? 'block' : 'hidden md:block')}>
        <div>
          <h3 className="text-sm font-medium mb-2">Типы</h3>
          <div className="flex flex-wrap gap-2">
            {availableTypes.map((type) => (
              <FilterChip
                key={type}
                selected={filters.types.includes(type)}
                onClick={() => toggle('types', type)}
              >
                {NOTE_TYPE_META[type].pluralLabel}
              </FilterChip>
            ))}
          </div>
        </div>

        {availableDomains.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2">Домены</h3>
            <div className="flex flex-wrap gap-2">
              {availableDomains.map((domain) => (
                <FilterChip
                  key={domain}
                  selected={filters.domains.includes(domain)}
                  onClick={() => toggle('domains', domain)}
                >
                  {domainLabel(domain)}
                </FilterChip>
              ))}
            </div>
          </div>
        )}

        {/* Датировка есть у большинства заметок, но спросить «что было
            между 1600 и 1800» до сих пор было нельзя */}
        <div>
          <h3 className="mb-2 text-sm font-medium">Годы</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              value={filters.fromYear ?? ''}
              onChange={(e) =>
                onFiltersChange({ ...filters, fromYear: parseYear(e.target.value) })
              }
              placeholder="от"
              aria-label="Год от"
              className="h-9 w-24"
            />
            <span className="text-muted-foreground">—</span>
            <Input
              type="number"
              inputMode="numeric"
              value={filters.toYear ?? ''}
              onChange={(e) =>
                onFiltersChange({ ...filters, toYear: parseYear(e.target.value) })
              }
              placeholder="до"
              aria-label="Год до"
              className="h-9 w-24"
            />
            <span className="text-xs text-muted-foreground">до н.э. — со знаком минус</span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {PERIODS.map((period) => {
              const selected =
                filters.fromYear === period.from && filters.toYear === period.to;
              return (
                <FilterChip
                  key={period.label}
                  selected={selected}
                  onClick={() =>
                    onFiltersChange({
                      ...filters,
                      fromYear: selected ? null : period.from,
                      toYear: selected ? null : period.to,
                    })
                  }
                >
                  {period.label}
                </FilterChip>
              );
            })}
          </div>
        </div>

        <div className="pt-2 border-t text-sm text-muted-foreground flex items-center justify-between gap-3">
          <span aria-live="polite">
            Найдено: {resultCount} из {notes.length}
          </span>
          {active && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFiltersChange(EMPTY_FILTERS)}
              className="hidden md:inline-flex"
            >
              Сбросить
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
