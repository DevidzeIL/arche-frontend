/**
 * PersonPage - Шаблон страницы для персоны
 * Стиль: арт-энциклопедия
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Users, BookOpen, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MuseumCard, TypeBadge } from '@/components/museum';
import { MarkdownViewer } from '@/arche/markdown/components';
import { ArcheNote } from '@/arche/types';
import { PersonMetadata } from './types';
import { cn } from '@/lib/utils';

interface PersonPageProps {
  note: ArcheNote;
  metadata?: PersonMetadata;
  relatedNotes: ArcheNote[];
}

export function PersonPage({ note, metadata, relatedNotes }: PersonPageProps) {
  const navigate = useNavigate();
  
  // Извлекаем изображение портрета
  const portraitImage = useMemo(() => {
    if (metadata?.portrait) {
      return metadata.portrait.startsWith('/') 
        ? metadata.portrait 
        : `/arche-vault/_imgs/${metadata.portrait}`;
    }
    // Ищем в body
    const imageMatch = note.body.match(/!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp|svg))\]\]/i);
    if (imageMatch) {
      return `/arche-vault/_imgs/${imageMatch[1]}`;
    }
    return null;
  }, [metadata, note.body]);
  
  // Убираем изображение из body, чтобы не дублировалось
  const bodyWithoutImage = useMemo(() => {
    let cleaned = note.body;
    
    // Убираем ![[image.png]] (wikilink изображения)
    cleaned = cleaned.replace(/!\[\[[^\]]+\.(png|jpg|jpeg|gif|webp|svg)\]\]/gi, '');
    
    // Убираем ![alt](path) (markdown изображения)
    cleaned = cleaned.replace(/!\[[^\]]*\]\([^\)]+\.(png|jpg|jpeg|gif|webp|svg)\)/gi, '');
    
    // Убираем <img> теги
    cleaned = cleaned.replace(/<img[^>]+>/gi, '');
    
    // Убираем пустые строки
    cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
    
    return cleaned.trim();
  }, [note.body]);
  
  // Годы жизни
  const lifeYears = metadata?.birthYear && metadata?.deathYear
    ? `${metadata.birthYear} — ${metadata.deathYear}`
    : metadata?.birthYear
    ? `род. ${metadata.birthYear}`
    : null;
  
  return (
    <div className="h-full w-full overflow-y-auto bg-background">
      <div className="container mx-auto px-6 lg:px-12 py-12 max-w-5xl">
        {/* Навигация назад */}
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-8 -ml-2"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Назад
        </Button>
        
        {/* Заголовок */}
        <header className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <h1 className="text-5xl lg:text-6xl font-serif font-light text-foreground/95 leading-tight">
              {note.title}
            </h1>
            <TypeBadge type={note.type} />
          </div>
          
          {/* Метаданные */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {lifeYears && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>{lifeYears}</span>
              </div>
            )}
            
            {metadata?.birthPlace && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>{metadata.birthPlace}</span>
              </div>
            )}
            
            {metadata?.nationality && (
              <span className="font-medium">{metadata.nationality}</span>
            )}
            
            {metadata?.occupation && metadata.occupation.length > 0 && (
              <span>{metadata.occupation.join(', ')}</span>
            )}
          </div>
        </header>
        
        {/* Портрет (если есть) */}
        {portraitImage && (
          <div className="mb-12">
            <div className="max-w-md mx-auto lg:max-w-lg">
              <div className="aspect-[3/4] rounded-lg overflow-hidden bg-muted border border-border/30">
                <img
                  src={portraitImage}
                  alt={note.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            </div>
          </div>
        )}
        
        {/* Основной текст */}
        <article className="prose prose-lg max-w-none">
          <div className="text-base leading-relaxed space-y-6 max-w-3xl mx-auto">
            <MarkdownViewer content={bodyWithoutImage} />
          </div>
        </article>
        
        {/* Боковая информация (если есть) */}
        {(metadata?.era || metadata?.movement || metadata?.school || metadata?.keyWorks || metadata?.keyIdeas) && (
          <aside className="mt-12 pt-8 border-t border-border/30 max-w-3xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Контекст */}
              {(metadata?.era || metadata?.movement || metadata?.school) && (
                <div className="border border-border/30 rounded-lg p-4 bg-card">
                  <h3 className="text-sm font-semibold mb-3 text-foreground/90">Контекст</h3>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    {metadata.era && <div><strong>Эпоха:</strong> {metadata.era}</div>}
                    {metadata.movement && <div><strong>Направление:</strong> {metadata.movement}</div>}
                    {metadata.school && <div><strong>Школа:</strong> {metadata.school}</div>}
                  </div>
                </div>
              )}
              
              {/* Ключевые работы */}
              {metadata?.keyWorks && metadata.keyWorks.length > 0 && (
                <div className="border border-border/30 rounded-lg p-4 bg-card">
                  <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground/90">Ключевые работы</h3>
                  </div>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {metadata.keyWorks.map((work, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>{work}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Ключевые идеи */}
              {metadata?.keyIdeas && metadata.keyIdeas.length > 0 && (
                <div className="border border-border/30 rounded-lg p-4 bg-card">
                  <div className="flex items-center gap-2 mb-3">
                    <Lightbulb className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground/90">Ключевые идеи</h3>
                  </div>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {metadata.keyIdeas.map((idea, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>{idea}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </aside>
        )}
        
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

