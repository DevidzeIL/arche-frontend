/**
 * GraphSettingsPanel - Панель настроек графа
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { X, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface GraphSettings {
  nodeSize: number;
  linkDistance: number;
  chargeStrength: number;
  filters: {
    types: string[];
    domains: string[];
  };
  showOnlyConnected: boolean;
}

interface GraphSettingsPanelProps {
  settings: GraphSettings;
  onSettingsChange: (settings: GraphSettings) => void;
  onClose?: () => void;
  className?: string;
}

const TYPE_OPTIONS = [
  { value: 'hub', label: 'Хабы' },
  { value: 'time', label: 'Эпохи' },
  { value: 'concept', label: 'Концепции' },
  { value: 'person', label: 'Персоны' },
  { value: 'work', label: 'Работы' },
  { value: 'place', label: 'Места' },
  { value: 'event', label: 'События' },
  { value: 'note', label: 'Заметки' },
];

const DOMAIN_OPTIONS = [
  { value: 'philosophy', label: 'Философия' },
  { value: 'art', label: 'Искусство' },
  { value: 'literature', label: 'Литература' },
  { value: 'science', label: 'Наука' },
  { value: 'history', label: 'История' },
  { value: 'psychology', label: 'Психология' },
];

export function GraphSettingsPanel({
  settings,
  onSettingsChange,
  onClose,
  className,
}: GraphSettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(true);

  const updateSetting = <K extends keyof GraphSettings>(
    key: K,
    value: GraphSettings[K]
  ) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const toggleType = (type: string) => {
    const newTypes = settings.filters.types.includes(type)
      ? settings.filters.types.filter(t => t !== type)
      : [...settings.filters.types, type];
    updateSetting('filters', { ...settings.filters, types: newTypes });
  };

  const toggleDomain = (domain: string) => {
    const newDomains = settings.filters.domains.includes(domain)
      ? settings.filters.domains.filter(d => d !== domain)
      : [...settings.filters.domains, domain];
    updateSetting('filters', { ...settings.filters, domains: newDomains });
  };

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="icon"
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed top-20 right-4 z-40 rounded-full',
          className
        )}
      >
        <Filter className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <div className={cn(
      'fixed top-20 right-4 w-80 bg-card border border-border rounded-lg shadow-lg z-40',
      'max-h-[calc(100vh-6rem)] overflow-y-auto',
      className
    )}>
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold">Настройки графа</h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setIsOpen(false);
            onClose?.();
          }}
          className="h-8 w-8 rounded-full"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 space-y-6">
        {/* Размер нод */}
        <div className="space-y-2">
          <Label className="text-sm">Размер нод</Label>
          <Slider
            value={[settings.nodeSize]}
            onValueChange={([value]) => updateSetting('nodeSize', value)}
            min={2}
            max={20}
            step={1}
            className="w-full"
          />
          <div className="text-xs text-muted-foreground text-right">
            {settings.nodeSize}px
          </div>
        </div>

        {/* Расстояние между нодами */}
        <div className="space-y-2">
          <Label className="text-sm">Расстояние связей</Label>
          <Slider
            value={[settings.linkDistance]}
            onValueChange={([value]) => updateSetting('linkDistance', value)}
            min={30}
            max={200}
            step={5}
            className="w-full"
          />
          <div className="text-xs text-muted-foreground text-right">
            {settings.linkDistance}px
          </div>
        </div>

        {/* Сила отталкивания */}
        <div className="space-y-2">
          <Label className="text-sm">Сила отталкивания</Label>
          <Slider
            value={[settings.chargeStrength]}
            onValueChange={([value]) => updateSetting('chargeStrength', value)}
            min={-500}
            max={-50}
            step={10}
            className="w-full"
          />
          <div className="text-xs text-muted-foreground text-right">
            {settings.chargeStrength}
          </div>
        </div>

        <Separator />

        {/* Фильтры по типам */}
        <div className="space-y-2">
          <Label className="text-sm">Типы</Label>
          <div className="flex flex-wrap gap-2">
            {TYPE_OPTIONS.map(option => {
              const isActive = settings.filters.types.length === 0 || settings.filters.types.includes(option.value);
              return (
                <button
                  key={option.value}
                  onClick={() => toggleType(option.value)}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded-md border transition-all duration-200',
                    isActive
                      ? 'bg-accent border-border text-foreground'
                      : 'bg-background border-border/50 text-muted-foreground hover:border-border hover:text-foreground hover:bg-accent/50'
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Фильтры по доменам */}
        <div className="space-y-2">
          <Label className="text-sm">Домены</Label>
          <div className="flex flex-wrap gap-2">
            {DOMAIN_OPTIONS.map(option => {
              const isActive = settings.filters.domains.length === 0 || settings.filters.domains.includes(option.value);
              return (
                <button
                  key={option.value}
                  onClick={() => toggleDomain(option.value)}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded-md border transition-all duration-200',
                    isActive
                      ? 'bg-accent border-border text-foreground'
                      : 'bg-background border-border/50 text-muted-foreground hover:border-border hover:text-foreground hover:bg-accent/50'
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Показывать только связанные */}
        <div className="flex items-center justify-between">
          <Label className="text-sm">Только связанные</Label>
          <Switch
            checked={settings.showOnlyConnected}
            onCheckedChange={(checked) => updateSetting('showOnlyConnected', checked)}
          />
        </div>

        <Separator />

        {/* Легенда цветов */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Цвета типов</Label>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#3b82f6]"></div>
              <span className="text-muted-foreground">Персоны</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#8b5cf6]"></div>
              <span className="text-muted-foreground">Работы</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#10b981]"></div>
              <span className="text-muted-foreground">Концепции</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#f59e0b]"></div>
              <span className="text-muted-foreground">Эпохи</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#ef4444]"></div>
              <span className="text-muted-foreground">Места</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#9ca3af]"></div>
              <span className="text-muted-foreground">Хабы</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#6b7280]"></div>
              <span className="text-muted-foreground">Заметки</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

