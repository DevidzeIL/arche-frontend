import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RootLayout } from '@/layouts/RootLayout';
import { MapPage } from '@/pages/MapPage';
import { NotePage } from '@/pages/NotePage';
import { HomePage } from '@/pages/HomePage';
import { StudyPage } from '@/pages/StudyPage';
import { ChapterPage } from '@/pages/ChapterPage';
import { ReviewPage } from '@/pages/ReviewPage';
import { ExamPage } from '@/pages/ExamPage';
import { AuthoredQuizPage } from '@/pages/AuthoredQuizPage';
import { ContactPage } from '@/pages/ContactPage';
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
        path: 'study',
        element: <StudyPage />,
      },
      {
        path: 'study/review',
        element: <ReviewPage />,
      },
      {
        path: 'study/quiz/:noteId',
        element: <AuthoredQuizPage />,
      },
      {
        path: 'study/:hubId/exam',
        element: <ExamPage />,
      },
      {
        path: 'study/:hubId/:chapterIndex',
        element: <ChapterPage />,
      },
      {
        path: 'contact',
        element: <ContactPage />,
      },
      {
        // Граф стал частью карты; старые ссылки на /graph ведут туда же
        path: 'graph',
        element: <Navigate to="/timeline" replace />,
      },
      {
        // Ловим всё остальное внутри layout — раньше неизвестный адрес давал пустой экран
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);
