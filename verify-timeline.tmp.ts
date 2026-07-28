/**
 * Прогоняет реальный parseNote + enrichAllNotes по файлам vault'а и печатает раскладку.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative, basename } from 'path';
import { parseNote } from './src/arche/parser/index';
import { enrichAllNotes, formatYear } from './src/components/timeline/utils/timelineEnricher';
import type { ArcheNote } from './src/arche/types';

const VAULT = process.argv[2];

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.md')) acc.push(full);
  }
  return acc;
}

const files = walk(VAULT);
const notes: ArcheNote[] = [];
for (const file of files) {
  const note = parseNote(relative(VAULT, file).split('\\').join('/'), readFileSync(file, 'utf8'));
  if (note) notes.push(note);
}

const enriched = enrichAllNotes(notes);
const dropped = notes.filter((n) => !enriched.some((e) => e.id === n.id));

console.log(`Заметок распарсено: ${notes.length}`);
console.log(`Попало на таймлайн: ${enriched.length}`);
console.log(`Без датировки: ${dropped.length} -> ${dropped.map((n) => n.title).join(', ') || '—'}`);

const outOfRange = enriched.filter((n) => n.timeline.displayYear < -800 || n.timeline.displayYear > 2025);
console.log(`Вне шкалы (-800..2025): ${outOfRange.length} -> ${outOfRange.map((n) => `${n.title}@${n.timeline.displayYear}`).join(', ') || '—'}`);

const byYear = new Map<number, string[]>();
enriched.forEach((n) => {
  const list = byYear.get(n.timeline.displayYear) ?? [];
  list.push(n.title);
  byYear.set(n.timeline.displayYear, list);
});
const piles = [...byYear.entries()].filter(([, list]) => list.length > 4);
console.log(`Точки со скоплением >4 карточек: ${piles.length}`);
piles.forEach(([year, list]) => console.log(`   ${year}: ${list.length} — ${list.join(', ')}`));

console.log('\nРаскладка по годам:');
[...enriched]
  .sort((a, b) => a.timeline.displayYear - b.timeline.displayYear)
  .forEach((n) => {
    const t = n.timeline;
    const range = t.endYear !== undefined ? `${formatYear(t.startYear, t.precision)} – ${formatYear(t.endYear, t.precision)}` : formatYear(t.startYear, t.precision);
    console.log(`  ${String(t.displayYear).padStart(6)}  [${(n.type ?? '?').padEnd(8)}] ${basename(n.title)}  (${range})`);
  });
