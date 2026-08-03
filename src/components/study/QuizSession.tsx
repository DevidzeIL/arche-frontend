import { useState } from 'react';
import { QuizQuestionView } from './QuizQuestionView';
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
  const [results, setResults] = useState<QuizResult[]>([]);

  const question = questions[index];
  if (!question) return null;

  const isLast = index === questions.length - 1;

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

      <QuizQuestionView
        key={question.cardId}
        question={question}
        nextLabel={isLast ? 'Завершить' : 'Дальше'}
        onAnswer={(correct, selectedId) => {
          setResults((r) => [...r, { question, selectedId, correct }]);
          onAnswer?.(question, correct);
        }}
        onNext={() => {
          if (isLast) onFinish(results);
          else setIndex(index + 1);
        }}
      />
    </div>
  );
}
