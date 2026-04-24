import { useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function ScrollToTop() {
  const location = useLocation();

  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    if (location.hash) {
      const targetId = location.hash.slice(1);

      const scrollToTarget = () => {
        const target = document.getElementById(targetId);
        if (target) {
          target.scrollIntoView({ behavior: 'auto', block: 'start' });
          return true;
        }
        return false;
      };

      if (scrollToTarget()) {
        return;
      }

      const frame = window.requestAnimationFrame(() => {
        scrollToTarget();
      });

      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [location.pathname, location.search, location.hash]);

  return null;
}
