import { useState, useMemo, useEffect } from 'react';
import { Search, X, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ArcheNote } from '@/arche/types';

interface SearchAndFilterProps {
  notes: ArcheNote[];
  onFilteredNotesChange: (filtered: ArcheNote[]) => void;
  className?: string;
}

export function SearchAndFilter({ notes, onFilteredNotesChange, className }: SearchAndFilterProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  // Получаем уникальные типы и домены
  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    notes.forEach(note => {
      if (note.type) types.add(note.type);
    });
    return Array.from(types).sort();
  }, [notes]);

  const availableDomains = useMemo(() => {
    const domains = new Set<string>();
    notes.forEach(note => {
      if (note.domain && note.domain.length > 0) {
        note.domain.forEach(d => domains.add(d));
      }
    });
    return Array.from(domains).sort();
  }, [notes]);

  // Фильтрация заметок
  const filteredNotes = useMemo(() => {
    let result = notes;

    // Поиск по тексту
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(note => {
        const titleMatch = note.title.toLowerCase().includes(query);
        const textMatch = note.plainText?.toLowerCase().includes(query);
        const domainMatch = note.domain?.some(d => d.toLowerCase().includes(query));
        return titleMatch || textMatch || domainMatch;
      });
    }

    // Фильтр по типам
    if (selectedTypes.size > 0) {
      result = result.filter(note => note.type && selectedTypes.has(note.type));
    }

    // Фильтр по доменам
    if (selectedDomains.size > 0) {
      result = result.filter(note => {
        if (!note.domain || note.domain.length === 0) return false;
        return note.domain.some(d => selectedDomains.has(d));
      });
    }

    return result;
  }, [notes, searchQuery, selectedTypes, selectedDomains]);

  // Уведомляем родителя об изменении отфильтрованных заметок
  useEffect(() => {
    onFilteredNotesChange(filteredNotes);
  }, [filteredNotes, onFilteredNotesChange]);

  const toggleType = (type: string) => {
    const newSet = new Set(selectedTypes);
    if (newSet.has(type)) {
      newSet.delete(type);
    } else {
      newSet.add(type);
    }
    setSelectedTypes(newSet);
  };

  const toggleDomain = (domain: string) => {
    const newSet = new Set(selectedDomains);
    if (newSet.has(domain)) {
      newSet.delete(domain);
    } else {
      newSet.add(domain);
    }
    setSelectedDomains(newSet);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedTypes(new Set());
    setSelectedDomains(new Set());
  };

  const hasActiveFilters = searchQuery.trim() || selectedTypes.size > 0 || selectedDomains.size > 0;

  const typeLabels: Record<string, string> = {
    hub: 'Хабы',
    time: 'Эпохи',
    concept: 'Концепции',
    person: 'Персоны',
    work: 'Работы',
    place: 'Места',
    note: 'Заметки',
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Поиск */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Поиск по названию, тексту или домену..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 pr-10"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Кнопка фильтров (мобильная) */}
      <div className="flex items-center justify-between md:hidden">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="w-full"
        >
          <Filter className="h-4 w-4 mr-2" />
          Фильтры
          {hasActiveFilters && (
            <Badge variant="secondary" className="ml-2">
              {selectedTypes.size + selectedDomains.size}
            </Badge>
          )}
        </Button>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="ml-2"
          >
            Сбросить
          </Button>
        )}
      </div>

      {/* Панель фильтров */}
      <div className={cn(
        'space-y-4 border rounded-lg p-4 bg-card',
        showFilters ? 'block' : 'hidden md:block'
      )}>
        {/* Типы */}
        <div>
          <h3 className="text-sm font-medium mb-2">Типы</h3>
          <div className="flex flex-wrap gap-2">
            {availableTypes.map(type => (
              <Badge
                key={type}
                variant={selectedTypes.has(type) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => toggleType(type)}
              >
                {typeLabels[type] || type}
              </Badge>
            ))}
          </div>
        </div>

        {/* Домены */}
        {availableDomains.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2">Домены</h3>
            <div className="flex flex-wrap gap-2">
              {availableDomains.map(domain => (
                <Badge
                  key={domain}
                  variant={selectedDomains.has(domain) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => toggleDomain(domain)}
                >
                  {domain}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Результаты */}
        <div className="pt-2 border-t text-sm text-muted-foreground">
          Найдено: {filteredNotes.length} из {notes.length}
        </div>
      </div>
    </div>
  );
}

