import { useArcheStore } from '@/arche/state/store';
import { MuseumCard, TypeBadge } from '@/components/museum';
import { useNavigate } from 'react-router-dom';

export function HomePage() {
  const notes = useArcheStore((state) => state.notes);
  const navigate = useNavigate();

  // Группируем по типам
  const notesByType = notes.reduce((acc, note) => {
    const type = note.type || 'note';
    if (!acc[type]) acc[type] = [];
    acc[type].push(note);
    return acc;
  }, {} as Record<string, typeof notes>);

  const typeOrder = ['hub', 'time', 'concept', 'person', 'work', 'place', 'note'];

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="container mx-auto px-8 py-16 max-w-7xl">
      <header className="mb-16">
          <h1 className="text-5xl font-serif font-light mb-4 text-foreground/95">
            Arche
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Личная энциклопедия культуры, истории, философии и искусства
          </p>
        </header>

        <div className="space-y-12">
          {typeOrder.map((type) => {
            const typeNotes = notesByType[type] || [];
            if (typeNotes.length === 0) return null;

            return (
              <section key={type} className="space-y-6">
                <h2 className="text-3xl font-serif text-foreground/90">
                  {type === 'hub' && 'Хабы'}
                  {type === 'time' && 'Эпохи'}
                  {type === 'concept' && 'Концепции'}
                  {type === 'person' && 'Персоны'}
                  {type === 'work' && 'Работы'}
                  {type === 'place' && 'Места'}
                  {type === 'note' && 'Заметки'}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {typeNotes.slice(0, 9).map((note) => (
                    <MuseumCard
                      key={note.id}
                      variant="subtle"
                      onClick={() => navigate(`/note/${note.id}`)}
                      className="cursor-pointer"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-xl font-serif flex-1">{note.title}</h3>
                          <TypeBadge type={note.type} />
                        </div>
                        {note.plainText && (
                          <p className="text-sm text-muted-foreground line-clamp-3">
                            {note.plainText.substring(0, 200)}
                          </p>
                        )}
                      </div>
                    </MuseumCard>
                  ))}
                </div>

                {typeNotes.length > 9 && (
                  <div className="text-center pt-4">
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

