/**
 * Заметки хранилища ↔ элементы Wikidata.
 *
 * Привязку подбирает скрипт (pnpm kb → public/kb/vault.json) по названию
 * с проверкой типа: персона — человек, место — что-то с координатами.
 * Если он ошибся, в заметке пишется `wikidata: Q…` — ручное поле сильнее.
 * Сами заметки скрипт не трогает.
 */
import { useEffect, useMemo, useState } from 'react';
import { useArcheStore } from './state/store';
import { loadVaultLinks } from './kb';
import type { ArcheNote } from './types';

export interface VaultLinks {
  qidOf: (noteId: string) => string | undefined;
  notesOf: (qid: string) => ArcheNote[];
  ready: boolean;
}

export function useVaultLinks(): VaultLinks {
  const notes = useArcheStore((s) => s.notes);
  const [generated, setGenerated] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let alive = true;
    loadVaultLinks().then((links) => alive && setGenerated(links ?? {}));
    return () => {
      alive = false;
    };
  }, []);

  return useMemo(() => {
    const byNote = new Map<string, string>();
    for (const note of notes) {
      const qid = note.wikidata ?? generated?.[note.id];
      if (qid) byNote.set(note.id, qid);
    }
    const byQid = new Map<string, ArcheNote[]>();
    for (const note of notes) {
      const qid = byNote.get(note.id);
      if (!qid) continue;
      const list = byQid.get(qid) ?? [];
      list.push(note);
      byQid.set(qid, list);
    }
    return {
      qidOf: (noteId: string) => byNote.get(noteId),
      notesOf: (qid: string) => byQid.get(qid) ?? [],
      ready: generated !== null,
    };
  }, [notes, generated]);
}
