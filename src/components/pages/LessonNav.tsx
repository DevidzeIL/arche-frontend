import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, GraduationCap } from 'lucide-react';
import { useArcheStore } from '@/arche/state/store';
import { useProgressStore } from '@/arche/learning/progressStore';
import { buildCourses } from '@/arche/learning/curriculum';
import { Button } from '@/components/ui/button';
import type { ArcheNote } from '@/arche/types';

interface LessonNavProps {
  note: ArcheNote;
}

/**
 * Где эта заметка в курсе и что читать дальше.
 *
 * Страница заметки знала только свой id, поэтому курс, открытый по ссылке
 * из главы, разваливался на отдельные страницы: ни «где я», ни «что дальше».
 * Всё нужное уже собрано в curriculum.ts — оставалось показать.
 *
 * Заметка может входить в несколько глав; берём первое вхождение,
 * потому что оси хаба идут по сюжету, и первое — самое раннее.
 */
export function LessonNav({ note }: LessonNavProps) {
  const notes = useArcheStore((state) => state.notes);
  const lessonsRead = useProgressStore((state) => state.lessonsRead);

  const place = useMemo(() => {
    for (const course of buildCourses(notes)) {
      for (const chapter of course.chapters) {
        const index = chapter.lessons.findIndex((lesson) => lesson.noteId === note.id);
        if (index < 0) continue;
        return {
          course,
          chapter,
          index,
          lesson: chapter.lessons[index],
          next: chapter.lessons[index + 1] ?? null,
        };
      }
    }
    return null;
  }, [notes, note.id]);

  if (!place) return null;

  const { course, chapter, index, lesson, next } = place;
  const readCount = chapter.lessons.filter((l) => lessonsRead[l.noteId]).length;

  return (
    <section className="space-y-3 border-t border-border/30 pt-8">
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs uppercase tracking-wider text-muted-foreground">
        <GraduationCap className="h-3.5 w-3.5" aria-hidden />
        <Link to={`/study/${course.hubId}/${chapter.index}`} className="hover:text-foreground">
          {chapter.ordinal ? `${chapter.ordinal}: ${chapter.title}` : chapter.title}
        </Link>
        <span>
          · урок {index + 1} из {chapter.lessons.length}
        </span>
      </div>

      {lesson.hook && <p className="text-sm text-muted-foreground">{lesson.hook}</p>}

      <div className="h-1 overflow-hidden rounded-full bg-border/40">
        <div
          className="h-full bg-primary/70 transition-all"
          style={{ width: `${(readCount / chapter.lessons.length) * 100}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {next ? (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/note/${next.noteId}`}>
              Дальше: {next.title}
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/study/${course.hubId}/${chapter.index}`}>
              Глава дочитана — к тесту
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}
