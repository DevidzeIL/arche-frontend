import { useNavigate } from 'react-router-dom';
import { MapView } from '@/components/map/MapView';

export function MapPage() {
  const navigate = useNavigate();

  return (
    <div className="h-full w-full">
      <MapView onOpenNote={(noteId) => navigate(`/note/${noteId}`)} />
    </div>
  );
}
