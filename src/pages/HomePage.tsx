import { useState, useMemo, useEffect } from 'react';
import { useArcheStore } from '@/arche/state/store';
import { MuseumCard, TypeBadge } from '@/components/museum';
import { useNavigate } from 'react-router-dom';
import { SearchAndFilter } from '@/components/home/SearchAndFilter';
import type { ArcheNote } from '@/arche/types';

export function HomePage() {
  const notes = useArcheStore((state) => state.notes);
  const navigate = useNavigate();
  const [filteredNotes, setFilteredNotes] = useState<ArcheNote[]>(notes);

  // Обновляем filteredNotes при изменении notes
  useEffect(() => {
    setFilteredNotes(notes);
  }, [notes]);

  // Группируем по типам из отфильтрованных заметок
  const notesByType = useMemo(() => {
    return filteredNotes.reduce((acc, note) => {
      const type = note.type || 'note';
      if (!acc[type]) acc[type] = [];
      acc[type].push(note);
      return acc;
    }, {} as Record<string, ArcheNote[]>);
  }, [filteredNotes]);

  const typeOrder = ['hub', 'time', 'concept', 'person', 'work', 'place', 'note'];

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
          </header>

          {/* Поиск и фильтрация */}
          <div className="mb-8 sm:mb-12">
            <SearchAndFilter
              notes={notes}
              onFilteredNotesChange={setFilteredNotes}
            />
          </div>

          <div className="space-y-8 sm:space-y-10 lg:space-y-12">
          {typeOrder.map((type) => {
            const typeNotes = notesByType[type] || [];
            if (typeNotes.length === 0) return null;

            return (
              <section key={type} className="space-y-4 sm:space-y-6">
                <h2 className="text-2xl sm:text-3xl font-serif text-foreground/90">
                  {type === 'hub' && 'Хабы'}
                  {type === 'time' && 'Эпохи'}
                  {type === 'concept' && 'Концепции'}
                  {type === 'person' && 'Персоны'}
                  {type === 'work' && 'Работы'}
                  {type === 'place' && 'Места'}
                  {type === 'note' && 'Заметки'}
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {typeNotes.slice(0, 9).map((note) => (
                    <MuseumCard
                      key={note.id}
                      variant="subtle"
                      onClick={() => navigate(`/note/${note.id}`)}
                      className="cursor-pointer"
                    >
                      <div className="space-y-2 sm:space-y-3">
                        <div className="flex items-start justify-between gap-2 sm:gap-3">
                          <h3 className="text-lg sm:text-xl font-serif flex-1">{note.title}</h3>
                          <TypeBadge type={note.type} />
                        </div>
                        {note.plainText && (
                          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 sm:line-clamp-3">
                            {note.plainText.substring(0, 200)}
                          </p>
                        )}
                      </div>
                    </MuseumCard>
                  ))}
                </div>

                {typeNotes.length > 9 && (
                  <div className="text-center pt-2 sm:pt-4">
                    <button
                      onClick={() => navigate(`/timeline?type=${type}`)}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Показать все ({typeNotes.length})
                    </button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

