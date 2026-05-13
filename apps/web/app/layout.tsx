import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Campus AI Canvas Platform',
  description: 'A modular chat and canvas workspace for university students.',
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

/**
 * Defines the global visual language once so every future module inherits the
 * same typography and page chrome automatically.
 */
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
