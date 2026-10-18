import { RotateCcw } from 'lucide-react';
import { COLORINGS } from '@/arche/coloring';
import { cn } from '@/lib/utils';
import type { Density, GlobeLayers, GlobeSettings } from './globeSettings';

/** Значок слоя — тот же, что на карте: легенда и переключатель в одном месте */
export function LayerSymbol({ kind }: { kind: keyof GlobeLayers | 'place' }) {
  switch (kind) {
    case 'place':
      return <span className="h-2.5 w-2.5 rounded-full bg-[#7fc8a9]" />;
    case 'states':
      return <span className="h-2.5 w-3.5 rounded-sm border border-foreground/40 bg-[hsl(200_55%_60%/0.35)]" />;
    case 'capitals':
      return <span className="h-2 w-2 border border-foreground/70 bg-background" />;
    case 'background':
      return <span className="h-2.5 w-3.5 rounded-sm border border-dashed border-foreground/40 bg-foreground/10" />;
    case 'events':
      return <span className="h-2 w-2 rotate-45 bg-[#7c4dbd] dark:bg-[#c4a7e7]" />;
    case 'people':
      return <span className="h-2 w-2 rounded-full bg-[#2f7fa8] dark:bg-[#89c4e1]" />;
    case 'arcs':
      return <span className="h-px w-3.5 bg-[#e0af68]" />;
    case 'labels':
      return <span className="text-[10px] leading-none text-muted-foreground">Аа</span>;
  }
}

const LAYERS: Array<{ key: keyof GlobeLayers; label: string; hint: string }> = [
  { key: 'states', label: 'Границы', hint: 'Государства на выбранный год; пунктир — объединения' },
  { key: 'capitals', label: 'Столицы', hint: 'Подписываются при приближении' },
  { key: 'background', label: 'Народы', hint: 'Где государств нет — народы и культуры' },
  { key: 'events', label: 'События', hint: 'Сражения, договоры, соборы, стройки' },
  { key: 'people', label: 'Люди', hint: 'Кто жил в это время, по месту рождения' },
  { key: 'arcs', label: 'Дуги влияния', hint: 'Причинные связи между местами хранилища' },
  { key: 'labels', label: 'Подписи', hint: 'Государств, столиц, событий; места подписаны всегда' },
];

const DENSITIES: Array<{ key: Density; label: string }> = [
  { key: 'less', label: 'Реже' },
  { key: 'normal', label: 'Обычно' },
  { key: 'more', label: 'Гуще' },
];

const STEPS = [
  { value: 1, label: 'год' },
  { value: 10, label: '10 лет' },
  { value: 100, label: 'век' },
];

const SPEEDS = [0.5, 1, 2, 4];

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: Array<{ key: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-muted/40 p-0.5">
      {options.map((option) => (
        <button
          key={String(option.key)}
          type="button"
          onClick={() => onChange(option.key)}
          aria-pressed={option.key === value}
          className={cn(
            'flex-1 rounded-md px-2 py-1 text-xs transition-colors',
            option.key === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Chips({
  items,
  hidden,
  onToggle,
  disabled,
}: {
  items: Array<{ key: string; label: string; count?: number }>;
  hidden: string[];
  onToggle: (key: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn('flex flex-wrap gap-1', disabled && 'pointer-events-none opacity-40')}>
      {items.map((item) => {
        const on = !hidden.includes(item.key);
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onToggle(item.key)}
            aria-pressed={on}
            className={cn(
              'rounded-full border px-2 py-0.5 text-[11.5px] transition-colors',
              on
                ? 'border-foreground/25 bg-accent/60 text-foreground'
                : 'border-border/50 text-muted-foreground line-through decoration-muted-foreground/50'
            )}
          >
            {item.label}
            {item.count !== undefined && <span className="ml-1 text-muted-foreground">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5 border-t border-border/40 pt-2.5 first:border-t-0 first:pt-0">
      <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

export function GlobeSettingsPanel({
  settings,
  eventKinds,
  peopleGroups,
  onUpdate,
  onLayer,
  onReset,
}: {
  settings: GlobeSettings;
  /** Виды событий с числом видимых сейчас */
  eventKinds: Array<{ key: string; label: string; count?: number }>;
  peopleGroups: Array<{ key: string; label: string; count?: number }>;
  onUpdate: (patch: Partial<GlobeSettings>) => void;
  onLayer: (key: keyof GlobeLayers, value: boolean) => void;
  onReset: () => void;
}) {
  const toggle = (list: string[], key: string) =>
    list.includes(key) ? list.filter((k) => k !== key) : [...list, key];

  return (
    <div className="pointer-events-auto max-h-[min(70vh,640px)] w-[min(320px,calc(100vw-24px))] space-y-3 overflow-y-auto rounded-xl border border-border/50 bg-card/95 p-3 text-sm backdrop-blur-sm">
      <Section title="Показывать">
        <ul className="space-y-1">
          <li className="flex items-start gap-2">
            <span className="w-[13px]" aria-hidden />
            <span className="mt-1 flex w-4 justify-center">
              <LayerSymbol kind="place" />
            </span>
            <span>
              <span className="block leading-tight">Заметки хранилища</span>
              <span className="block text-[11px] leading-snug text-muted-foreground">Город — точка, регион — пятно; видны всегда</span>
            </span>
          </li>
          {LAYERS.map(({ key, label, hint }) => (
            <li key={key}>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={settings.layers[key]}
                  onChange={(e) => onLayer(key, e.target.checked)}
                  className="mt-1 accent-primary"
                />
                <span className="mt-1 flex w-4 justify-center">
                  <LayerSymbol kind={key} />
                </span>
                <span>
                  <span className="block leading-tight">{label}</span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">{hint}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Раскраска карты">
        <Segmented
          options={COLORINGS}
          value={settings.coloring}
          onChange={(coloring) => onUpdate({ coloring })}
        />
        <p className="text-[11px] leading-snug text-muted-foreground">
          По религии, языку или правлению — по сведениям Wikidata; где их нет, государство серое.
        </p>
      </Section>

      {eventKinds.length > 0 && (
        <Section title="События">
          <Chips
            items={eventKinds}
            hidden={settings.hiddenEventKinds}
            disabled={!settings.layers.events}
            onToggle={(key) => onUpdate({ hiddenEventKinds: toggle(settings.hiddenEventKinds, key) })}
          />
        </Section>
      )}

      {peopleGroups.length > 0 && (
        <Section title="Люди">
          <Chips
            items={peopleGroups}
            hidden={settings.hiddenPeopleGroups}
            disabled={!settings.layers.people}
            onToggle={(key) => onUpdate({ hiddenPeopleGroups: toggle(settings.hiddenPeopleGroups, key) })}
          />
        </Section>
      )}

      <Section title="Сколько точек">
        <Segmented options={DENSITIES} value={settings.density} onChange={(density) => onUpdate({ density })} />
      </Section>

      <Section title="Время">
        <div className="grid grid-cols-[4.5rem_1fr] items-center gap-x-2 gap-y-1.5">
          <span className="text-[12px] text-muted-foreground">Шаг ‹ ›</span>
          <Segmented
            options={STEPS.map((s) => ({ key: s.value, label: s.label }))}
            value={settings.step}
            onChange={(step) => onUpdate({ step })}
          />
          <span className="text-[12px] text-muted-foreground">Скорость</span>
          <Segmented
            options={SPEEDS.map((s) => ({ key: s, label: `×${s}` }))}
            value={settings.speed}
            onChange={(speed) => onUpdate({ speed })}
          />
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Стрелки ← → двигают год на шаг, пробел — проиграть или остановить.
        </p>
      </Section>

      <div className="flex items-center justify-between border-t border-border/40 pt-2.5">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          Как было
        </button>
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        Границы — реконструкция, упрощены и приблизительны, особенно в древности.{' '}
        <a href="https://github.com/Seshat-Global-History-Databank/cliopatria" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
          Cliopatria
        </a>{' '}
        (CC BY 4.0),{' '}
        <a href="https://github.com/aourednik/historical-basemaps" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
          historical-basemaps
        </a>{' '}
        (GPL-3.0),{' '}
        <a href="https://www.wikidata.org/" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
          Wikidata
        </a>{' '}
        (CC0), справки — Википедия (CC BY-SA).
      </p>
    </div>
  );
}
