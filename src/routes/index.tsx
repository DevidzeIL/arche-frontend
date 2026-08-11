import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RootLayout } from '@/layouts/RootLayout';
import { HomePage } from '@/pages/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ErrorPage } from '@/pages/ErrorPage';

/**
 * Тяжёлые экраны грузятся по требованию.
 *
 * Одним куском бандл весил около 470 КБ в gzip, и его целиком скачивал
 * каждый, кто зашёл прочитать одну заметку. Больше всего весят те разделы,
 * которые открывают реже всего: глобус тянет d3-geo с очертаниями суши,
 * карта — свой рендер и раскладку, учёба — генератор вопросов.
 *
 * Заметки при этом уже загружены: App показывает роутер только после
 * разбора хранилища, поэтому пустого экрана между маршрутами не будет.
 */
const lazyPage = <T extends Record<string, unknown>>(
  load: () => Promise<T>,
  name: keyof T
) => ({
  lazy: async () => ({ Component: (await load())[name] as React.ComponentType }),
});

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
        ...lazyPage(() => import('@/pages/MapPage'), 'MapPage'),
      },
      {
        path: 'globe',
        ...lazyPage(() => import('@/pages/GlobePage'), 'GlobePage'),
      },
      {
        path: 'feed',
        ...lazyPage(() => import('@/pages/FeedPage'), 'FeedPage'),
      },
      {
        path: 'health',
        ...lazyPage(() => import('@/pages/HealthPage'), 'HealthPage'),
      },
      {
        path: 'note/:noteId',
        ...lazyPage(() => import('@/pages/NotePage'), 'NotePage'),
      },
      {
        path: 'study',
        ...lazyPage(() => import('@/pages/StudyPage'), 'StudyPage'),
      },
      {
        path: 'study/today',
        ...lazyPage(() => import('@/pages/TodayPage'), 'TodayPage'),
      },
      {
        // Повторение стало частью ежедневной практики; старые ссылки ведут туда же
        path: 'study/review',
        element: <Navigate to="/study/today" replace />,
      },
      {
        path: 'study/quiz/:noteId',
        ...lazyPage(() => import('@/pages/AuthoredQuizPage'), 'AuthoredQuizPage'),
      },
      {
        path: 'study/:hubId/exam',
        ...lazyPage(() => import('@/pages/ExamPage'), 'ExamPage'),
      },
      {
        path: 'study/:hubId/:chapterIndex',
        ...lazyPage(() => import('@/pages/ChapterPage'), 'ChapterPage'),
      },
      {
        path: 'contact',
        ...lazyPage(() => import('@/pages/ContactPage'), 'ContactPage'),
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
