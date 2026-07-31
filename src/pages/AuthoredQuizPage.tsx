import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useArcheStore } from '@/arche/state/store';
import { parseAuthoredQuiz } from '@/arche/learning/authoredQuiz';
import { TestRunner } from '@/components/study/TestRunner';
import { Button } from '@/components/ui/button';

/** Авторский тест — заметка type: quiz из vault'а */
export function AuthoredQuizPage() {
  const { noteId } = useParams<{ noteId: string }>();
  const getNote = useArcheStore((s) => s.getNote);

  const note = noteId ? getNote(noteId) : undefined;
  const quiz = useMemo(() => (note ? parseAuthoredQuiz(note) : null), [note]);

  if (!quiz) {
    return (
      <div className="container mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="mb-4 font-serif text-2xl">Тест не найден</h1>
        <Button asChild variant="outline">
          <Link to="/study">К учёбе</Link>
        </Button>
      </div>
    );
  }

  return (
    <TestRunner
      title={quiz.title}
      description={quiz.description}
      progressId={`quiz:${quiz.noteId}`}
      questionCount={quiz.questions.length}
      // Пересобираем при каждой попытке: варианты перемешиваются заново
      buildQuestions={() => parseAuthoredQuiz(note!)?.questions ?? []}
    />
  );
}
