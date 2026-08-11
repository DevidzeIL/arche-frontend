import { useMemo, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Stethoscope } from 'lucide-react';
import { useArcheStore } from '@/arche/state/store';
import { MuseumCard, TypeBadge } from '@/components/museum';
import { SearchAndFilter } from '@/components/home/SearchAndFilter';
import { Button } from '@/components/ui/button';
import { NOTE_TYPES_ORDERED, noteTypePluralLabel } from '@/arche/noteTypes';
import { applyNoteFilters, hasActiveFilters, EMPTY_FILTERS, type NoteFilters } from '@/arche/search';
import { firstImageOf } from '@/arche/images';
import { excerptOf } from '@/arche/excerpt';
import type { ArcheNote } from '@/arche/types';

const PREVIEW_COUNT = 9;

export function HomePage() {
  const notes = useArcheStore((state) => state.notes);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Фильтры переживают перезагрузку и делятся ссылкой
  const filters = useMemo<NoteFilters>(
    () => ({
      query: searchParams.get('q') ?? '',
      types: searchParams.getAll('type'),
      domains: searchParams.getAll('domain'),
    }),
    [searchParams]
  );

  const setFilters = useCallback(
    (next: NoteFilters) => {
      const params = new URLSearchParams();
      if (next.query.trim()) params.set('q', next.query);
      next.types.forEach((type) => params.append('type', type));
      next.domains.forEach((domain) => params.append('domain', domain));
      setSearchParams(params, { replace: true });
    },
    [setSearchParams]
  );

  // Секции, для которых пользователь нажал «Показать все»
  const [expandedTypes, setExpandedTypes] = useState<string[]>([]);

  const filteredNotes = useMemo(() => applyNoteFilters(notes, filters), [notes, filters]);

  const notesByType = useMemo(() => {
    const grouped = new Map<string, ArcheNote[]>();
    filteredNotes.forEach((note) => {
      const type = note.type || 'note';
      const list = grouped.get(type) ?? [];
      list.push(note);
      grouped.set(type, list);
    });
    return grouped;
  }, [filteredNotes]);

  // Порядок секций из реестра типов; неизвестные типы всё равно показываем — в конце
  const sectionTypes = useMemo(() => {
    const known = NOTE_TYPES_ORDERED.filter((type) => notesByType.has(type));
    const unknown = [...notesByType.keys()].filter(
      (type) => !NOTE_TYPES_ORDERED.includes(type as (typeof NOTE_TYPES_ORDERED)[number])
    );
    return [...known, ...unknown];
  }, [notesByType]);

  const toggleExpanded = (type: string) => {
    setExpandedTypes((current) =>
      current.includes(type) ? current.filter((t) => t !== type) : [...current, type]
    );
  };

  const filtersActive = hasActiveFilters(filters);

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16 max-w-7xl">
        <header className="mb-8 sm:mb-12 lg:mb-16">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-light mb-3 sm:mb-4 text-foreground/95">
            Arche
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl">
            Личная энциклопедия культуры, истории, философии и искусства
          </p>
          <Link
            to="/health"
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
          >
            <Stethoscope className="h-3.5 w-3.5" aria-hidden />
            Что стоит дописать
          </Link>
        </header>

        <div className="mb-8 sm:mb-12">
          <SearchAndFilter
            notes={notes}
            filters={filters}
            onFiltersChange={setFilters}
            resultCount={filteredNotes.length}
          />
        </div>

        {filteredNotes.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border/40 rounded-lg">
            <h2 className="text-2xl font-serif mb-2 text-foreground/90">Ничего не нашлось</h2>
            <p className="text-muted-foreground mb-6">
              {filtersActive
                ? 'Попробуйте изменить запрос или снять часть фильтров.'
                : 'В хранилище пока нет заметок.'}
            </p>
            {filtersActive && (
              <Button variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}>
                Сбросить фильтры
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-8 sm:space-y-10 lg:space-y-12">
            {sectionTypes.map((type) => {
              const typeNotes = notesByType.get(type) ?? [];
              const expanded = expandedTypes.includes(type);
              const visible = expanded ? typeNotes : typeNotes.slice(0, PREVIEW_COUNT);
              const hidden = typeNotes.length - visible.length;

              return (
                <section key={type} className="space-y-4 sm:space-y-6">
                  <h2 className="text-2xl sm:text-3xl font-serif text-foreground/90">
                    {noteTypePluralLabel(type)}{' '}
                    <span className="text-base text-muted-foreground font-sans">{typeNotes.length}</span>
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {visible.map((note) => (
                      <MuseumCard
                        key={note.id}
                        variant="subtle"
                        onClick={() => navigate(`/note/${note.id}`)}
                        ariaLabel={`Открыть заметку «${note.title}»`}
                      >
                        <div className="flex gap-3 sm:gap-4">
                          {firstImageOf(note.body) && (
                            <img
                              src={firstImageOf(note.body)!}
                              alt=""
                              loading="lazy"
                              className="h-16 w-16 shrink-0 rounded-md object-cover sm:h-20 sm:w-20"
                            />
                          )}
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex items-start justify-between gap-2 sm:gap-3">
                              <h3 className="flex-1 font-serif text-lg sm:text-xl">{note.title}</h3>
                              <TypeBadge type={note.type} />
                            </div>
                            <p className="line-clamp-3 text-sm text-muted-foreground">
                              {excerptOf(note, 180)}
                            </p>
                          </div>
                        </div>
                      </MuseumCard>
                    ))}
                  </div>

                  {(hidden > 0 || expanded) && (
                    <div className="text-center pt-2 sm:pt-4">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(type)}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
                      >
                        {expanded ? 'Свернуть' : `Показать все (${typeNotes.length})`}
                      </button>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
