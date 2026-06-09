'use client';

import { useEffect, useState } from 'react';
import App from './App';
import { registerOwnershipGlobals } from './lib/runtime';

export default function NextClientApp() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    registerOwnershipGlobals();
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return <App />;
}
