import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { QuizQuestion } from '@/arche/learning/quiz';

interface QuizQuestionViewProps {
  question: QuizQuestion;
  /** Вызывается один раз, сразу после выбора варианта */
  onAnswer: (correct: boolean, selectedId: string) => void;
  onNext: () => void;
  nextLabel: string;
}

/**
 * Один вопрос с вариантами. Вынесен из QuizSession, потому что тем же
 * вопросом пользуется ежедневная практика — там он идёт вперемешку
 * с карточками на воспоминание.
 *
 * Своё состояние сбрасывается через key={question.cardId} снаружи.
 */
export function QuizQuestionView({ question, onAnswer, onNext, nextLabel }: QuizQuestionViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const answered = selectedId !== null;
  const wasCorrect = selectedId === question.correctId;

  const choose = (optionId: string) => {
    if (answered) return;
    setSelectedId(optionId);
    onAnswer(optionId === question.correctId, optionId);
  };

  return (
    <div className="space-y-5">
      <p className="whitespace-pre-line font-serif text-lg leading-relaxed">{question.prompt}</p>

      <div className="space-y-2">
        {question.options.map((option) => {
          const isCorrectOption = option.id === question.correctId;
          const isSelected = option.id === selectedId;

          return (
            <button
              key={option.id}
              type="button"
              data-quiz-option
              disabled={answered}
              onClick={() => choose(option.id)}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
                !answered && 'border-border/50 hover:border-primary/50 hover:bg-accent/50',
                answered && isCorrectOption && 'border-emerald-500/70 bg-emerald-500/10',
                answered && isSelected && !isCorrectOption && 'border-red-500/70 bg-red-500/10',
                answered && !isCorrectOption && !isSelected && 'border-border/30 opacity-50'
              )}
            >
              <span className="text-[15px]">{option.label}</span>
              {answered && isCorrectOption && (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
              )}
              {answered && isSelected && !isCorrectOption && (
                <XCircle className="h-4 w-4 shrink-0 text-red-500" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      {answered && (
        <div
          className={cn(
            'space-y-2 rounded-lg border p-4',
            wasCorrect ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-red-500/40 bg-red-500/5'
          )}
        >
          <p className="text-sm font-medium">{wasCorrect ? 'Верно' : 'Не совсем'}</p>
          {question.explanation && (
            <p className="text-sm leading-relaxed text-muted-foreground">{question.explanation}</p>
          )}
          <div className="flex items-center justify-between pt-1">
            {question.noteId ? (
              <Link
                to={`/note/${question.noteId}`}
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                Открыть заметку
              </Link>
            ) : (
              <span />
            )}
            <Button size="sm" onClick={onNext} data-quiz-next autoFocus>
              {nextLabel}
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
