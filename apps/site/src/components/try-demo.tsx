'use client';

import * as React from 'react';
import { Loader2, MousePointerClick } from 'lucide-react';
import type { Lang } from '@/lib/site';
import { openDemo, useSiteSettings } from '@/lib/live';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * "Try it now — no sign-up": opens a real shop, read-only, in the app.
 * Shown only while the console offers the demo (Website → Try the demo).
 */
export function TryDemoButton({
  lang,
  className,
  size = 'lg',
  variant = 'outline',
}: {
  lang: Lang;
  className?: string;
  size?: 'md' | 'lg';
  variant?: 'outline' | 'primary' | 'glass';
}) {
  const s = useSiteSettings();
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  if (!s.demo.enabled) return null;

  const go = async () => {
    setBusy(true);
    setFailed(false);
    const ok = await openDemo();
    if (!ok) {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <Button type="button" size={size} variant={variant} className={cn('group', className)} onClick={() => void go()} disabled={busy}>
        {busy ? <Loader2 className="size-5 animate-spin" /> : <MousePointerClick className="size-5 text-primary" />}
        {lang === 'bn' ? 'এখনই ডেমো দেখুন' : 'Try the live demo'}
      </Button>
      <span className="text-[11px] text-muted-foreground">
        {failed
          ? lang === 'bn'
            ? 'ডেমো এখন খোলা যাচ্ছে না — একটু পরে চেষ্টা করুন।'
            : 'The demo would not open — try again in a moment.'
          : lang === 'bn'
            ? 'সাইন আপ ছাড়াই · শুধু দেখার জন্য'
            : 'No sign-up · look around, change nothing'}
      </span>
    </span>
  );
}
