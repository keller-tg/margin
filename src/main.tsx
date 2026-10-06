// base styles first: component styles (imported by the routes below) must come after them in the cascade
import './index.css';
import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router';
import { PrefsProvider } from './app/PrefsContext';
import { Landing } from './app/routes/Landing';
import { NotFound } from './app/routes/NotYet';
import { Pace } from './app/routes/Pace';
import { Begin, Read } from './app/routes/Read';

const routes: RouteObject[] = [
  { path: '/', element: <Landing /> },
  { path: '/begin', element: <Begin /> },
  { path: '/pace', element: <Pace /> },
  { path: '/read/:lang/:date/:slot', element: <Read /> },
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
