import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="container mx-auto px-6 py-24 max-w-2xl text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground mb-4">404</p>
        <h1 className="text-4xl font-serif font-light mb-4 text-foreground/95">Страница не найдена</h1>
        <p className="text-muted-foreground mb-8">
          Такого адреса в Arche нет. Возможно, заметку переименовали или ссылка устарела.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button asChild>
            <Link to="/">На главную</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/timeline">К таймлайну</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
