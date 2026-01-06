import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from '@/layouts/RootLayout';
import { TimelinePage } from '@/pages/TimelinePage';
import { NotePage } from '@/pages/NotePage';
import { GraphPage } from '@/pages/GraphPage';
import { HomePage } from '@/pages/HomePage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
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
    ],
  },
]);

