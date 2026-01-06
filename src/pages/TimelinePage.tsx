import { TimeRuler } from '@/components/timeline/TimeRuler';
import { useNavigate } from 'react-router-dom';

export function TimelinePage() {
  const navigate = useNavigate();

  return (
    <div className="h-full w-full">
      <TimeRuler onNoteClick={(noteId) => navigate(`/note/${noteId}`)} />
    </div>
  );
}

