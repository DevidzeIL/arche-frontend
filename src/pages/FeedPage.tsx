import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Check, Layers, Shuffle } from 'lucide-react';
import { useArcheStore } from '@/arche/state/store';
import { useProgressStore } from '@/arche/learning/progressStore';
import { buildFragments, buildFeed, type FeedStep } from '@/arche/feed';
import { buildDeck } from '@/arche/learning/flashcards';
import { RELATION_META } from '@/arche/relations';
import { noteTypeLabel, noteTypeMeta } from '@/arche/noteTypes';
import { MarkdownViewer } from '@/arche/markdown/components';
import { Button } from '@/components/ui/button';

/** Сколько фрагментов подгружается за раз */
const BATCH = 8;

/**
 * Лента: зашёл, прочитал один блок, пошёл дальше.
 *
 * Отличие от бесконечной прокрутки в том, что порядок не случаен —
 * следующий фрагмент берётся у соседа по графу, и переход подписан
 * тем же объяснением, что рисует карта. После десяти минут остаётся
 * не набор фактов, а пройденный кусок сюжета.
 */
export function FeedPage() {
  const navigate = useNavigate();
  const notes = useArcheStore((s) => s.notes);
  const graph = useArcheStore((s) => s.knowledgeGraph);

  const markFragmentRead = useProgressStore((s) => s.markFragmentRead);
  const markLessonRead = useProgressStore((s) => s.markLessonRead);
  const seedCards = useProgressStore((s) => s.seedCards);
  const cards = useProgressStore((s) => s.cards);

  const fragments = useMemo(() => buildFragments(notes, graph), [notes, graph]);

  /** noteId → карточки заметки: нужны кнопке «Запомнить» и её начальному виду */
  const cardIdsByNote = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const card of buildDeck(notes, graph).values()) {
      const list = map.get(card.noteId);
      if (list) list.push(card.cardId);
      else map.set(card.noteId, [card.cardId]);
    }
    return map;
  }, [notes, graph]);

  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [steps, setSteps] = useState<FeedStep[]>([]);
  const shownRef = useRef(new Set<string>());

  const extend = useCallback(
    (from: number, reset: boolean) => {
      // feedSeen читаем разово: если подписаться, лента пересобиралась бы
      // прямо под пальцем на каждый прочитанный фрагмент
      const seen = useProgressStore.getState().feedSeen;
      if (reset) shownRef.current = new Set();

      const next = buildFeed({
        graph,
        fragments,
        seen,
        seed: from,
        length: BATCH,
        exclude: shownRef.current,
      });
      next.forEach((step) => shownRef.current.add(step.fragment.id));
      setSteps((current) => (reset ? next : [...current, ...next]));
    },
    [graph, fragments]
  );

  useEffect(() => {
    extend(seed, true);
  }, [extend, seed]);

  // Подгрузка при подходе к концу
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || steps.length === 0) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) extend(seed + steps.length, false);
      },
      { rootMargin: '600px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [extend, seed, steps.length]);

  const openNote = (noteId: string) => {
    markLessonRead(noteId);
    navigate(`/note/${noteId}`);
  };

  const remember = (noteId: string) => seedCards(cardIdsByNote.get(noteId) ?? []);

  if (fragments.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-muted-foreground">
        Читать пока нечего: в заметках нет разделов подходящей длины.
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="container mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <header className="mb-4">
          <div className="flex items-center justify-between gap-4">
            <h1 className="font-serif text-3xl">Листать</h1>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSeed(Math.floor(Math.random() * 1e9))}
            >
              <Shuffle className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Заново
            </Button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            По одному блоку за раз. Каждый следующий связан с предыдущим.
          </p>
        </header>

        <div className="space-y-3">
          {steps.map((step, index) => {
            const ids = cardIdsByNote.get(step.fragment.noteId) ?? [];
            return (
              <FeedCard
                key={step.fragment.id}
                step={step}
                first={index === 0}
                remembered={ids.length > 0 && ids.every((id) => cards[id])}
                onRead={markFragmentRead}
                onOpen={openNote}
                onRemember={remember}
              />
            );
          })}
        </div>

        <div ref={sentinelRef} className="py-10 text-center text-sm text-muted-foreground">
          Дальше ещё
        </div>
      </div>
    </div>
  );
}

interface FeedCardProps {
  step: FeedStep;
  remembered: boolean;
  /** Самой первой карточке разделитель «другая ветка» не нужен */
  first: boolean;
  onRead: (fragmentId: string) => void;
  onOpen: (noteId: string) => void;
  onRemember: (noteId: string) => void;
}

function FeedCard({ step, remembered, first, onRead, onOpen, onRemember }: FeedCardProps) {
  const { fragment, via } = step;
  const ref = useRef<HTMLElement>(null);
  const [saved, setSaved] = useState(remembered);

  // Прочитанным считаем фрагмент, который побыл на экране целиком.
  // Иначе быстрая прокрутка «съедала» бы материал, который не читали.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let timer: number | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timer = window.setTimeout(() => onRead(fragment.id), 1500);
        } else if (timer) {
          window.clearTimeout(timer);
          timer = undefined;
        }
      },
      { threshold: 0.6 }
    );

    observer.observe(element);
    return () => {
      observer.disconnect();
      if (timer) window.clearTimeout(timer);
    };
  }, [fragment.id, onRead]);

  const meta = noteTypeMeta(fragment.noteType);

  return (
    <>
      {via ? (
        // Тип связи показан цветом стрелки, а словами — человеческое описание
        // из заметки: иначе выходит «развивает — развитие идеи логоса»
        <p className="flex items-baseline gap-1.5 px-1 pt-3 text-xs text-muted-foreground">
          <span className="shrink-0 text-foreground/70">{via.fromTitle}</span>
          <ArrowRight
            className="h-3 w-3 shrink-0 self-center"
            style={{ color: RELATION_META[via.kind].color }}
            aria-hidden
          />
          <span className="min-w-0">{via.label || RELATION_META[via.kind].label}</span>
        </p>
      ) : !first ? (
        <p className="flex items-center gap-2 px-1 pt-4 text-[11px] uppercase tracking-wider text-muted-foreground/60">
          <span className="h-px flex-1 bg-border/60" aria-hidden />
          другая ветка
          <span className="h-px flex-1 bg-border/60" aria-hidden />
        </p>
      ) : null}

      <article
        ref={ref}
        className="rounded-xl border border-border/40 bg-card/40 p-4 sm:p-5"
        aria-label={`${fragment.noteTitle}: ${fragment.heading}`}
      >
        <div className="mb-3 flex items-start gap-3">
          {fragment.image && (
            <img
              src={fragment.image}
              alt=""
              loading="lazy"
              className="h-12 w-12 shrink-0 rounded-lg object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: meta.graphColor }}
                aria-hidden
              />
              {noteTypeLabel(fragment.noteType)}
              {fragment.period && <span>· {fragment.period}</span>}
            </p>
            <h2 className="font-serif text-xl leading-tight">{fragment.noteTitle}</h2>
          </div>
        </div>

        <h3 className="mb-1.5 font-serif text-base text-foreground/80">{fragment.heading}</h3>
        <MarkdownViewer
          content={fragment.markdown}
          className="prose-sm prose-p:my-2 prose-p:leading-relaxed prose-li:my-0.5"
        />

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/30 pt-3">
          <Button variant="ghost" size="sm" onClick={() => onOpen(fragment.noteId)}>
            <BookOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Заметка целиком
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={saved}
            onClick={() => {
              onRemember(fragment.noteId);
              setSaved(true);
            }}
          >
            {saved ? (
              <>
                <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-500" aria-hidden />
                В повторении
              </>
            ) : (
              <>
                <Layers className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Запомнить
              </>
            )}
          </Button>
        </div>
      </article>
    </>
  );
}
