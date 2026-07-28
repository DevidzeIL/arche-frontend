import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from '@/layouts/RootLayout';
import { TimelinePage } from '@/pages/TimelinePage';
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
        path: 'timeline',
        element: <TimelinePage />,
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
