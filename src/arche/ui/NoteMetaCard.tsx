import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ArcheNote } from '../types';

interface NoteMetaCardProps {
  note: ArcheNote;
}

export function NoteMetaCard({ note }: NoteMetaCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader 
            className={cn(
              "flex flex-row items-center justify-between space-y-0 cursor-pointer hover:bg-muted/50 transition-colors",
              isOpen ? "rounded-t-lg pb-2" : "rounded-lg"
            )}
          >
            <CardTitle className="text-sm font-medium">Метаданные</CardTitle>
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform duration-200',
                isOpen && 'rotate-180'
              )}
            />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-4">
            {note.type && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Type</div>
                <Badge variant="outline">{note.type}</Badge>
              </div>
            )}
            {note.domain && note.domain.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Domain</div>
                <div className="flex flex-wrap gap-1">
                  {note.domain.map((d) => (
                    <Badge key={d} variant="secondary">
                      {d}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {note.status && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Status</div>
                <Badge variant="outline">{note.status}</Badge>
              </div>
            )}
            {note.group && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Group</div>
                <Badge variant="outline">{note.group}</Badge>
              </div>
            )}
            {note.folder && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Folder</div>
                <div className="text-sm">{note.folder}</div>
              </div>
            )}
            {note.created && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Created</div>
                <div className="text-sm">
                  {typeof note.created === 'string' 
                    ? note.created 
                    : note.created && typeof note.created === 'object' && 'toISOString' in note.created
                      ? (note.created as Date).toISOString().split('T')[0]
                      : String(note.created || '')}
                </div>
              </div>
            )}
            {note.updated && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Updated</div>
                <div className="text-sm">
                  {typeof note.updated === 'string' 
                    ? note.updated 
                    : note.updated && typeof note.updated === 'object' && 'toISOString' in note.updated
                      ? (note.updated as Date).toISOString().split('T')[0]
                      : String(note.updated || '')}
                </div>
              </div>
            )}
            <div>
              <div className="text-xs text-muted-foreground mb-1">Path</div>
              <div className="text-xs font-mono text-muted-foreground break-all">
                {note.path}
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

