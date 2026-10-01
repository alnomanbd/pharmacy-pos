import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLang, DEFAULT_LANG, type Lang } from '@/lib/site';
import { subpageMetadata } from '@/lib/subpage-meta';
import { AuthShell } from '@/components/auth-shell';
import { LoginForm } from '@/components/login-form';

export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'bn' }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return subpageMetadata(isLang(lang) ? lang : DEFAULT_LANG, 'login', 'login');
}

export default async function LoginPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const l = lang as Lang;

  return (
    <AuthShell lang={l} variant="login">
      <LoginForm lang={l} />
    </AuthShell>
  );
}