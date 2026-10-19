import type { RouteObject } from 'react-router';
import { RequireAuth } from '../auth/RequireAuth.tsx';
import { LoadingState } from '../components/States.tsx';
import { LoginPage } from '../features/account/LoginPage.tsx';
import { RegisterPage } from '../features/account/RegisterPage.tsx';
import { HomePage } from '../features/posts/HomePage.tsx';
import { PostPage } from '../features/posts/PostPage.tsx';
import { TagsPage } from '../features/tags/TagsPage.tsx';
import { ProfilePage } from '../features/users/ProfilePage.tsx';
import { NotFoundPage, RouteErrorPage } from './ErrorPages.tsx';
import { RootLayout } from './RootLayout.tsx';

/**
 * Every page. Readers' pages load eagerly; pages for signed-in authors are code-split (`lazy`), so
 * readers never download the editor or the Markdown renderer.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    hydrateFallbackElement: <LoadingState />,
    children: [
      {
        errorElement: <RouteErrorPage />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'posts/:slug', element: <PostPage /> },
          { path: 'tags', element: <TagsPage /> },
          { path: 'u/:username', element: <ProfilePage /> },
          { path: 'login', element: <LoginPage /> },
          { path: 'register', element: <RegisterPage /> },
          {
            element: <RequireAuth />,
            children: [
              {
                path: 'write',
                lazy: async () => ({
                  Component: (await import('../features/editor/EditorPage.tsx')).NewPostPage,
                }),
              },
              {
                path: 'write/:slug',
                lazy: async () => ({
                  Component: (await import('../features/editor/EditorPage.tsx')).EditPostPage,
                }),
              },
              {
                path: 'dashboard',
                lazy: async () => ({
                  Component: (await import('../features/dashboard/DashboardPage.tsx'))
                    .DashboardPage,
                }),
              },
              {
                path: 'settings',
                lazy: async () => ({
                  Component: (await import('../features/account/SettingsPage.tsx')).SettingsPage,
                }),
              },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
