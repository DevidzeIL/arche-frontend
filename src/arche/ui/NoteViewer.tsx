import { useArcheStore } from '../state/store';
import { MarkdownViewer } from '../markdown/components';
import { NoteMetaCard } from './NoteMetaCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { useArcheStore as useStore } from '../state/store';

export function NoteViewer() {
  const currentNote = useArcheStore((state) => state.getCurrentNote());
  const getBacklinks = useArcheStore((state) => state.getBacklinks);
  const openNote = useStore((state) => state.openNote);
  const getNoteByTitle = useStore((state) => state.getNoteByTitle);

  if (!currentNote) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Выберите заметку для просмотра
      </div>
    );
  }

  const backlinks = getBacklinks(currentNote.id);
  const outgoingLinks = currentNote.links
    .map((title) => {
      const note = getNoteByTitle(title);
      return { title, note };
    })
    .filter((link) => link.note || true); // Показываем все, даже не найденные

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Заголовок */}
        <div>
          <h1 className="text-3xl font-bold mb-2">{currentNote.title}</h1>
        </div>

        {/* Метаданные */}
        <NoteMetaCard note={currentNote} />

        {/* Контент */}
        <Card>
          <CardContent className="pt-6">
            <MarkdownViewer content={currentNote.body} />
          </CardContent>
        </Card>

        {/* Ссылки */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Исходящие ссылки */}
          {outgoingLinks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Исходящие ссылки</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {outgoingLinks.map((link) => (
                  <div key={link.title}>
                    {link.note ? (
                      <Button
                        variant="link"
                        className="p-0 h-auto font-normal text-left justify-start"
                        onClick={() => openNote(link.note!.id)}
                      >
                        {link.title}
                        <ExternalLink className="ml-2 h-3 w-3" />
                      </Button>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        {link.title} <span className="text-xs">(не найдено)</span>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Входящие ссылки (backlinks) */}
          {backlinks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Входящие ссылки</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {backlinks.map((note) => (
                  <Button
                    key={note.id}
                    variant="link"
                    className="p-0 h-auto font-normal text-left justify-start"
                    onClick={() => openNote(note.id)}
                  >
                    {note.title}
                    <ExternalLink className="ml-2 h-3 w-3" />
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

