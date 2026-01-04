import { useArcheStore } from '../state/store';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarRail,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight, FileText, Folder } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const FOLDER_GROUPS = [
  { id: '00_HUB', label: 'Hub', icon: Folder },
  { id: '01_Time', label: 'Time', icon: Folder },
  { id: '02_People', label: 'People', icon: Folder },
  { id: '03_Concepts', label: 'Concepts', icon: Folder },
  { id: '04_Events', label: 'Events', icon: Folder },
  { id: '05_Works', label: 'Works', icon: Folder },
  { id: '06_Culture', label: 'Culture', icon: Folder },
  { id: '07_Places', label: 'Places', icon: Folder },
  { id: '08_Science', label: 'Science', icon: Folder },
  { id: '09_Notes', label: 'Notes', icon: Folder },
];

export function ArcheSidebar() {
  const notes = useArcheStore((state) => state.notes);
  const openNote = useArcheStore((state) => state.openNote);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

  const toggleFolder = (folderId: string) => {
    const newOpen = new Set(openFolders);
    if (newOpen.has(folderId)) {
      newOpen.delete(folderId);
    } else {
      newOpen.add(folderId);
    }
    setOpenFolders(newOpen);
  };

  const notesByFolder = notes.reduce((acc, note) => {
    if (!acc[note.folder]) {
      acc[note.folder] = [];
    }
    acc[note.folder].push(note);
    return acc;
  }, {} as Record<string, typeof notes>);

  return (
    <Sidebar collapsible="offcanvas" variant="inset">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Заметки</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {FOLDER_GROUPS.map((group) => {
                const folderNotes = notesByFolder[group.id] || [];
                const isOpen = openFolders.has(group.id);

                if (folderNotes.length === 0) return null;

                return (
                  <Collapsible
                    key={group.id}
                    open={isOpen}
                    onOpenChange={() => toggleFolder(group.id)}
                    className="group/collapsible [&[data-state=open]>button>svg:first-child]:rotate-90"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton>
                          <ChevronRight className="transition-transform" />
                          <group.icon />
                          <span>{group.label}</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {folderNotes.length}
                          </span>
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                    </SidebarMenuItem>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {folderNotes.map((note) => (
                          <SidebarMenuItem key={note.id}>
                            <SidebarMenuSubButton
                              onClick={() => openNote(note.id)}
                            >
                              <FileText />
                              <span>{note.title}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

