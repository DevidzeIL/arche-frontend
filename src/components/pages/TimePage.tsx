/**
 * TimePage - Шаблон страницы для эпохи/периода
 * Стиль: арт-энциклопедия с акцентом на временной контекст
 */

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Users, BookOpen, Lightbulb, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MuseumCard, TypeBadge } from '@/components/museum';
import { MarkdownViewer } from '@/arche/markdown/components';
import { ArcheNote } from '@/arche/types';
import { TimeMetadata } from './types';
import { cn } from '@/lib/utils';

interface TimePageProps {
  note: ArcheNote;
  metadata?: TimeMetadata;
  relatedNotes: ArcheNote[];
}

export function TimePage({ note, metadata, relatedNotes }: TimePageProps) {
  const navigate = useNavigate();
  
  // Диапазон лет
  const yearRange = metadata?.startYear && metadata?.endYear
    ? `${metadata.startYear} — ${metadata.endYear}`
    : metadata?.startYear
    ? `с ${metadata.startYear}`
    : null;
  
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
          
          {/* Кнопка "Explore on timeline" */}
          <Button
            variant="outline"
            onClick={() => navigate(`/timeline?year=${metadata?.startYear || 1900}`)}
          >
            <Calendar className="mr-2 h-4 w-4" />
            На таймлайне
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
        
        {/* Hero Section */}
        <header className="mb-12 text-center">
          <div className="flex items-center justify-center gap-4 mb-4">
            <h1 className="text-5xl lg:text-6xl font-serif font-light text-foreground/95 leading-tight">
              {note.title}
            </h1>
            <TypeBadge type={note.type} />
          </div>
          
          {yearRange && (
            <div className="flex items-center justify-center gap-2 text-lg text-muted-foreground">
              <Calendar className="h-5 w-5" />
              <span>{yearRange}</span>
            </div>
          )}
        </header>
        
        {/* Суть эпохи (5 тезисов) */}
        {metadata?.essence && metadata.essence.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-serif mb-6 text-foreground/90">Суть эпохи</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {metadata.essence.map((point, idx) => (
                <div
                  key={idx}
                  className="border border-border/30 rounded-lg p-4 bg-card"
                >
                  <div className="text-sm font-semibold text-primary mb-2">
                    {idx + 1}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {point}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
        
        {/* Основной контент */}
        <div className="mb-12">
          <article className="prose prose-lg max-w-none">
            <div className="text-base leading-relaxed space-y-6 max-w-4xl mx-auto">
              <MarkdownViewer content={note.body} />
            </div>
          </article>
        </div>
        
        {/* Ключевые элементы эпохи */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {/* Ключевые персоны */}
          {metadata?.keyPeople && metadata.keyPeople.length > 0 && (
            <div className="border border-border/30 rounded-lg p-6 bg-card">
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-serif text-foreground/90">Ключевые персоны</h3>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {metadata.keyPeople.map((person, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>{person}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Ключевые работы */}
          {metadata?.keyWorks && metadata.keyWorks.length > 0 && (
            <div className="border border-border/30 rounded-lg p-6 bg-card">
              <div className="flex items-center gap-2 mb-4">
                <BookOpen className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-serif text-foreground/90">Ключевые работы</h3>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {metadata.keyWorks.map((work, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>{work}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Ключевые концепции */}
          {metadata?.keyConcepts && metadata.keyConcepts.length > 0 && (
            <div className="border border-border/30 rounded-lg p-6 bg-card">
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-serif text-foreground/90">Ключевые концепции</h3>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {metadata.keyConcepts.map((concept, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>{concept}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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

