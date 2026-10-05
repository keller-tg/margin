import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router';
import { PrefsProvider } from './app/PrefsContext';
import { Landing } from './app/routes/Landing';
import { NotFound, NotYet } from './app/routes/NotYet';
import './index.css';

const routes: RouteObject[] = [
  { path: '/', element: <Landing /> },
  { path: '/begin', element: <NotYet /> },
  { path: '/pace', element: <NotYet /> },
  { path: '*', element: <NotFound /> },
];

if (import.meta.env.DEV) {
  const Specimen = lazy(() => import('./app/routes/Specimen').then((m) => ({ default: m.Specimen })));
  routes.unshift({ path: '/specimen', element: <Suspense><Specimen /></Suspense> });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrefsProvider>
      <RouterProvider router={createBrowserRouter(routes)} />
    </PrefsProvider>
  </StrictMode>,
);
