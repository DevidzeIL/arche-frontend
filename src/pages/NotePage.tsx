import { useParams, useNavigate } from 'react-router-dom';
import { useArcheStore } from '@/arche/state/store';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PersonPage, WorkPage, ConceptPage, TimePage } from '@/components/pages';
import { parseMetadata } from '@/components/pages/metadataParser';
import { MarkdownViewer } from '@/arche/markdown/components';

export function NotePage() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const notes = useArcheStore((state) => state.notes);
  const getNote = useArcheStore((state) => state.getNote);

  const note = noteId ? getNote(noteId) : null;

  if (!note) {
    return (
      <div className="h-full w-full overflow-y-auto">
        <div className="container mx-auto px-8 py-16">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-8 rounded-md">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад
          </Button>
          <div className="text-center py-16">
            <h1 className="text-2xl font-serif mb-4">Заметка не найдена</h1>
            <p className="text-muted-foreground">Заметка с ID "{noteId}" не существует</p>
          </div>
        </div>
      </div>
    );
  }

  // Находим связанные заметки
  const relatedNotes = note.links
    .map((linkTitle) => notes.find((n) => n.title === linkTitle))
    .filter((n): n is typeof notes[0] => n !== undefined)
    .slice(0, 12);

  // Парсим метаданные
  const metadata = parseMetadata(note);

  // Выбираем правильный шаблон по типу
  switch (note.type) {
    case 'person':
      return (
        <PersonPage
          note={note}
          metadata={metadata as any}
          relatedNotes={relatedNotes}
        />
      );
    
    case 'work':
      return (
        <WorkPage
          note={note}
          metadata={metadata as any}
          relatedNotes={relatedNotes}
        />
      );
    
    case 'concept':
      return (
        <ConceptPage
          note={note}
          metadata={metadata as any}
          relatedNotes={relatedNotes}
        />
      );
    
    case 'time':
    case 'epoch':
      return (
        <TimePage
          note={note}
          metadata={metadata as any}
          relatedNotes={relatedNotes}
        />
      );
    
    default:
      // Fallback для других типов - используем простой шаблон
      return (
        <div className="h-full w-full overflow-y-auto bg-background">
          <div className="container mx-auto px-6 lg:px-12 py-12 max-w-4xl">
            <Button
              variant="ghost"
              onClick={() => navigate(-1)}
              className="mb-8 -ml-2"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Назад
            </Button>

            <article className="space-y-8">
              <header className="space-y-4 pb-8 border-b border-border/30">
                <h1 className="text-4xl font-serif font-light text-foreground/95">
                  {note.title}
                </h1>
              </header>

              <div className="prose prose-lg dark:prose-invert max-w-none">
                <div className="text-base leading-relaxed space-y-6">
                  <MarkdownViewer content={note.body} />
                </div>
              </div>

              {relatedNotes.length > 0 && (
                <section className="pt-8 border-t border-border/30">
                  <h2 className="text-2xl font-serif mb-6 text-foreground/90">
                    Связанные
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {relatedNotes.map((relatedNote) => (
                      <div
                        key={relatedNote.id}
                        onClick={() => navigate(`/note/${relatedNote.id}`)}
                        className="p-4 border border-border/30 rounded-lg cursor-pointer hover:border-primary/50 transition-colors"
                      >
                        <h3 className="text-lg font-serif mb-2">{relatedNote.title}</h3>
                        {relatedNote.plainText && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {relatedNote.plainText.substring(0, 120)}...
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </article>
          </div>
        </div>
      );
  }
}
