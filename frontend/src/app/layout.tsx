import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../index.css';

const appTitle = process.env.NEXT_PUBLIC_APP_TITLE || 'Simba Supermarket';
const appDescription =
  process.env.NEXT_PUBLIC_APP_DESCRIPTION ||
  'Simba Supermarket - groceries, drinks, home essentials, and delivery in Kigali.';

export const metadata: Metadata = {
  title: appTitle,
  description: appDescription,
  applicationName: appTitle,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
