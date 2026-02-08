import type { Metadata } from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import { AppProviders } from '@/components/providers/app-providers';
import './globals.css';

const grotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-grotesk' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Virtue Foundation Living Map',
  description:
    'Glassmorphic geospatial intelligence environment for the Virtue Foundation Ghana Initiative.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <body>
        <AppProviders>
          <div className="min-h-screen bg-[#05060c] text-white">
            {children}
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
