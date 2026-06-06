import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'MediaHub — Event & Media Management Platform',
    template: '%s | MediaHub',
  },
  description:
    'The ultimate platform for managing event photos, albums, and media. Upload, organize, and share your best moments.',
  keywords: ['event photos', 'media management', 'photo gallery', 'album sharing', 'event photography'],
  authors: [{ name: 'MediaHub Team' }],
  creator: 'MediaHub',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    title: 'MediaHub — Event & Media Management Platform',
    description: 'The ultimate platform for managing event photos, albums, and media.',
    siteName: 'MediaHub',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MediaHub',
    description: 'The ultimate platform for managing event photos, albums, and media.',
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="bg-background text-foreground font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
