import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { QuizQuestion } from '@/arche/learning/quiz';

export interface QuizResult {
  question: QuizQuestion;
  selectedId: string;
  correct: boolean;
}

interface QuizSessionProps {
  questions: QuizQuestion[];
  /** Вызывается сразу после ответа — здесь начисляется XP и двигается SRS */
  onAnswer?: (question: QuizQuestion, correct: boolean) => void;
  onFinish: (results: QuizResult[]) => void;
}

export function QuizSession({ questions, onAnswer, onFinish }: QuizSessionProps) {
  const [index, setIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [results, setResults] = useState<QuizResult[]>([]);

  const question = questions[index];
  if (!question) return null;

  const answered = selectedId !== null;
  const isLast = index === questions.length - 1;

  const choose = (optionId: string) => {
    if (answered) return;
    const correct = optionId === question.correctId;
    setSelectedId(optionId);
    setResults((r) => [...r, { question, selectedId: optionId, correct }]);
    onAnswer?.(question, correct);
  };

  const next = () => {
    if (isLast) {
      onFinish(results);
      return;
    }
    setIndex(index + 1);
    setSelectedId(null);
  };

  const wasCorrect = selectedId === question.correctId;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      {/* Прогресс */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Вопрос {index + 1} из {questions.length}
        </span>
        <span>{results.filter((r) => r.correct).length} верно</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-border/40">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${(index / questions.length) * 100}%` }}
        />
      </div>

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
            <Button size="sm" onClick={next} data-quiz-next>
              {isLast ? 'Завершить' : 'Дальше'}
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
