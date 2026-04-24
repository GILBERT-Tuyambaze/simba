import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackSiteVisit } from '@/lib/analytics';

export default function VisitTracker() {
  const location = useLocation();

  useEffect(() => {
    const path = `${location.pathname}${location.search}${location.hash}`;
    void trackSiteVisit(path).catch(() => {
      // Visitor tracking should never block the storefront experience.
    });
  }, [location.hash, location.pathname, location.search]);

  return null;
}
