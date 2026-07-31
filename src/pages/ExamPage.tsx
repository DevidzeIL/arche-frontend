import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useArcheStore } from '@/arche/state/store';
import { buildCourses } from '@/arche/learning/curriculum';
import { buildChapterQuiz } from '@/arche/learning/quiz';
import { TestRunner } from '@/components/study/TestRunner';
import { Button } from '@/components/ui/button';

const EXAM_SIZE = 20;

/** Экзамен по курсу: вопросы со всех глав вперемешку */
export function ExamPage() {
  const { hubId } = useParams<{ hubId: string }>();
  const notes = useArcheStore((s) => s.notes);
  const graph = useArcheStore((s) => s.knowledgeGraph);

  const course = useMemo(
    () => buildCourses(notes).find((c) => c.hubId === hubId),
    [notes, hubId]
  );

  if (!course) {
    return (
      <div className="container mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="mb-4 font-serif text-2xl">Курс не найден</h1>
        <Button asChild variant="outline">
          <Link to="/study">К учёбе</Link>
        </Button>
      </div>
    );
  }

  const allLessonIds = course.chapters.flatMap((ch) => ch.lessons.map((l) => l.noteId));

  return (
    <TestRunner
      title={`Экзамен: ${course.title}`}
      description="Вопросы со всех глав курса вперемешку — родословные идей, связи, авторы, хронология."
      progressId={`exam:${course.hubId}`}
      questionCount={EXAM_SIZE}
      buildQuestions={() => buildChapterQuiz(graph, allLessonIds, EXAM_SIZE)}
    />
  );
}
