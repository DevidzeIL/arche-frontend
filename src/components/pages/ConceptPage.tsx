/**
 * ConceptPage - Шаблон страницы для концепции/идеи
 * Стиль: арт-энциклопедия с акцентом на структуру
 */

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, HelpCircle, MessageSquare, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MuseumCard, TypeBadge } from '@/components/museum';
import { MarkdownViewer } from '@/arche/markdown/components';
import { ArcheNote } from '@/arche/types';
import { ConceptMetadata } from './types';

interface ConceptPageProps {
  note: ArcheNote;
  metadata?: ConceptMetadata;
  relatedNotes: ArcheNote[];
}

export function ConceptPage({ note, metadata, relatedNotes }: ConceptPageProps) {
  const navigate = useNavigate();
  
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
        
        {/* Hero Section */}
        <header className="mb-12">
          <div className="flex items-start justify-between gap-4 mb-6">
            <h1 className="text-5xl lg:text-6xl font-serif font-light text-foreground/95 leading-tight">
              {note.title}
            </h1>
            <TypeBadge type={note.type} />
          </div>
          
          {/* Краткое определение */}
          {metadata?.definition && (
            <div className="border-l-4 border-primary pl-6 py-4 bg-muted/30 rounded-r-lg">
              <p className="text-lg text-foreground/90 leading-relaxed italic">
                {metadata.definition}
              </p>
            </div>
          )}
        </header>
        
        {/* Основной контент */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
          {/* Основной текст */}
          <div className="lg:col-span-2">
            <article className="prose prose-lg max-w-none">
              <div className="text-base leading-relaxed space-y-6">
                <MarkdownViewer content={note.body} />
              </div>
            </article>
          </div>
          
          {/* Боковая панель: структура */}
          <aside className="lg:col-span-1 space-y-6">
            {/* Ключевые вопросы */}
            {metadata?.keyQuestions && metadata.keyQuestions.length > 0 && (
              <div className="border border-border/30 rounded-lg p-4 bg-card">
                <div className="flex items-center gap-2 mb-3">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground/90">Ключевые вопросы</h3>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {metadata.keyQuestions.map((question, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>{question}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Аргументы */}
            {metadata?.arguments && metadata.arguments.length > 0 && (
              <div className="border border-border/30 rounded-lg p-4 bg-card">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground/90">Аргументы / Варианты</h3>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {metadata.arguments.map((arg, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>{arg}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Контр-аргументы */}
            {metadata?.counterArguments && metadata.counterArguments.length > 0 && (
              <div className="border border-border/30 rounded-lg p-4 bg-card">
                <h3 className="text-sm font-semibold mb-3 text-foreground/90">Контр-аргументы</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {metadata.counterArguments.map((arg, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-destructive mt-1">•</span>
                      <span>{arg}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Происхождение */}
            {(metadata?.originYear || metadata?.originPerson) && (
              <div className="border border-border/30 rounded-lg p-4 bg-card">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground/90">Происхождение</h3>
                </div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  {metadata.originYear && <div><strong>Год:</strong> {metadata.originYear}</div>}
                  {metadata.originPerson && <div><strong>Автор:</strong> {metadata.originPerson}</div>}
                </div>
              </div>
            )}
          </aside>
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

