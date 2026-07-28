import { isRouteErrorResponse, useRouteError, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

/**
 * errorElement роутера: без него любая ошибка рендера показывает пустой экран.
 */
export function ErrorPage() {
  const error = useRouteError();

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Неизвестная ошибка';

  return (
    <div className="h-screen w-full overflow-y-auto bg-background">
      <div className="container mx-auto px-6 py-24 max-w-2xl text-center">
        <h1 className="text-4xl font-serif font-light mb-4 text-foreground/95">Что-то сломалось</h1>
        <p className="text-muted-foreground mb-2">
          Страницу не удалось отобразить. Попробуйте обновить или вернуться на главную.
        </p>
        <p className="text-sm text-muted-foreground/70 font-mono mb-8 break-words">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={() => window.location.reload()}>Обновить</Button>
          <Button variant="outline" asChild>
            <Link to="/">На главную</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
