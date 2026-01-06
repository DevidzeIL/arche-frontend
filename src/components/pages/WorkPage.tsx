/**
 * WorkPage - Шаблон страницы для произведения/работы
 * Стиль: арт-энциклопедия с крупным изображением
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Calendar, Palette, Ruler, MapPin, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MuseumCard, TypeBadge } from '@/components/museum';
import { MarkdownViewer } from '@/arche/markdown/components';
import { ArcheNote } from '@/arche/types';
import { WorkMetadata } from './types';
import { cn } from '@/lib/utils';
import { useArcheStore } from '@/arche/state/store';

interface WorkPageProps {
  note: ArcheNote;
  metadata?: WorkMetadata;
  relatedNotes: ArcheNote[];
}

export function WorkPage({ note, metadata, relatedNotes }: WorkPageProps) {
  const navigate = useNavigate();
  const getNote = useArcheStore((state) => state.getNote);
  
  // Извлекаем изображение
  const workImage = useMemo(() => {
    if (metadata?.image) {
      return metadata.image.startsWith('/') 
        ? metadata.image 
        : `/arche-vault/_imgs/${metadata.image}`;
    }
    // Ищем в body
    const imageMatch = note.body.match(/!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp|svg))\]\]/i);
    if (imageMatch) {
      return `/arche-vault/_imgs/${imageMatch[1]}`;
    }
    return null;
  }, [metadata, note.body]);
  
  // Навигация по работам
  const previousWork = metadata?.previousWork ? getNote(metadata.previousWork) : null;
  const nextWork = metadata?.nextWork ? getNote(metadata.nextWork) : null;
  
  return (
    <div className="h-full w-full overflow-y-auto bg-background">
      <div className="container mx-auto px-6 lg:px-12 py-12 max-w-7xl">
        {/* Навигация назад */}
        <div className="flex items-center justify-between mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="-ml-2"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад
          </Button>
          
          {/* Навигация по работам */}
          {(previousWork || nextWork) && (
            <div className="flex items-center gap-2">
              {previousWork && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/note/${previousWork.id}`)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Предыдущая
                </Button>
              )}
              {nextWork && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/note/${nextWork.id}`)}
                >
                  Следующая
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
        
        {/* Hero Section */}
        <header className="mb-12">
          <div className="flex items-start justify-between gap-4 mb-4">
            <h1 className="text-5xl lg:text-6xl font-serif font-light text-foreground/95 leading-tight">
              {note.title}
            </h1>
            <TypeBadge type={note.type} />
          </div>
          
          {/* Метаданные в одну строку */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {metadata?.year && (
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{metadata.year}</span>
              </div>
            )}
            {metadata?.artist && (
              <span>{metadata.artist}</span>
            )}
            {metadata?.medium && (
              <div className="flex items-center gap-1">
                <Palette className="h-4 w-4" />
                <span>{metadata.medium}</span>
              </div>
            )}
            {metadata?.dimensions && (
              <div className="flex items-center gap-1">
                <Ruler className="h-4 w-4" />
                <span>{metadata.dimensions}</span>
              </div>
            )}
          </div>
        </header>
        
        {/* Основной контент: изображение + текст */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Изображение справа */}
          {workImage && (
            <div className="lg:order-2">
              <div className="sticky top-24">
                <div className="rounded-lg overflow-hidden bg-muted border border-border/30">
                  <img
                    src={workImage}
                    alt={note.title}
                    className="w-full h-auto"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
                
                {/* Подпись */}
                <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                  {metadata?.year && (
                    <div><strong>Год:</strong> {metadata.year}</div>
                  )}
                  {metadata?.medium && (
                    <div><strong>Техника:</strong> {metadata.medium}</div>
                  )}
                  {metadata?.dimensions && (
                    <div><strong>Размеры:</strong> {metadata.dimensions}</div>
                  )}
                  {metadata?.location && (
                    <div className="flex items-start gap-1">
                      <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <span><strong>Место:</strong> {metadata.location}</span>
                    </div>
                  )}
                  {metadata?.collection && (
                    <div><strong>Коллекция:</strong> {metadata.collection}</div>
                  )}
                  {metadata?.source && (
                    <div>
                      <a
                        href={metadata.source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>Источник</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Текст слева */}
          <div className={cn("lg:order-1", !workImage && "lg:col-span-2")}>
            <article className="prose prose-lg max-w-none">
              <div className="text-base leading-relaxed space-y-6 max-w-2xl">
                <MarkdownViewer content={note.body} />
              </div>
            </article>
          </div>
        </div>
        
        {/* Связанные заметки */}
        {relatedNotes.length > 0 && (
          <section className="pt-8 border-t border-border/30">
            <h2 className="text-2xl font-serif mb-6 text-foreground/90">
              Связанные
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {relatedNotes.map((relatedNote) => (
                <MuseumCard
                  key={relatedNote.id}
                  variant="subtle"
                  onClick={() => navigate(`/note/${relatedNote.id}`)}
                  className="cursor-pointer"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-serif">{relatedNote.title}</h3>
                      <TypeBadge type={relatedNote.type} />
                    </div>
                    {relatedNote.plainText && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {relatedNote.plainText.substring(0, 120)}...
                      </p>
                    )}
                  </div>
                </MuseumCard>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

