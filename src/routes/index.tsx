import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from '@/layouts/RootLayout';
import { MapPage } from '@/pages/MapPage';
import { NotePage } from '@/pages/NotePage';
import { GraphPage } from '@/pages/GraphPage';
import { HomePage } from '@/pages/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ErrorPage } from '@/pages/ErrorPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        // Путь оставлен прежним: старые ссылки на /timeline продолжают работать
        path: 'timeline',
        element: <MapPage />,
      },
      {
        path: 'note/:noteId',
        element: <NotePage />,
      },
      {
        path: 'graph',
        element: <GraphPage />,
      },
      {
        // Ловим всё остальное внутри layout — раньше неизвестный адрес давал пустой экран
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);
