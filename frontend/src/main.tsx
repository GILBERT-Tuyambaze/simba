import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerOwnershipGlobals } from './lib/runtime';

// Initialize the app
function initializeApp() {
  registerOwnershipGlobals();

  // Prerendered blog pages are served as pure static HTML for SEO.
  // Intentionally skip React mounting so the crawler-facing markup stays
  // lightweight and self-contained - no client-side hydration needed.
  if (
    document
      .querySelector('meta[name="prerender-static-page"]')
      ?.getAttribute('content') === 'blog'
  ) {
    return;
  }

  // Render the app
  createRoot(document.getElementById('root')!).render(<App />);
}

initializeApp();
