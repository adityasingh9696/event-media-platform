import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Authentication',
  robots: { index: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      {children}
    </div>
  );
}
