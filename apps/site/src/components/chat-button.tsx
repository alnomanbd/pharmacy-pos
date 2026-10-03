'use client';

import * as React from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { siteConfig, type Lang } from '@/lib/site';

let liveNumber: string | null = null;

/** The number set in the console, read once per visit; the build's own until it arrives. */
function useWhatsApp() {
  const [n, setN] = React.useState(liveNumber ?? siteConfig.whatsapp);
  React.useEffect(() => {
    if (liveNumber !== null) return;
    let live = true;
    fetch(`${siteConfig.apiUrl}/public/site`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data?: { whatsapp?: string } } | null) => {
        if (!live || !j?.data) return;
        liveNumber = j.data.whatsapp ?? '';
        setN(liveNumber);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return n;
}

/**
 * "Ask us" — on every page, in the corner opposite the way back to the top.
 *
 * A shop owner here asks on WhatsApp before anything else, so when the number
 * is set (in the console, System → Website contact) the bubble
 * opens a chat with a first line already written. Until then it opens the
 * contact page, so the button is never a dead end. A small note pops out once
 * after a few seconds, and is put away for the visit when closed.
 */

const COPY = {
  en: { label: 'Ask us', note: 'Questions? Ask us on WhatsApp — a real person answers.', noteForm: 'Questions? Write to us — a real person answers.', hello: 'Hello, I would like to know about Dawai for my pharmacy.' },
  bn: { label: 'জিজ্ঞেস করুন', note: 'কোনো প্রশ্ন? WhatsApp-এ জিজ্ঞেস করুন — একজন মানুষই উত্তর দেবেন।', noteForm: 'কোনো প্রশ্ন? আমাদের লিখুন — একজন মানুষই উত্তর দেবেন।', hello: 'আসসালামু আলাইকুম, আমার ফার্মেসির জন্য Dawai সম্পর্কে জানতে চাই।' },
} as const;

const SEEN = 'dawai.site.chatnote';

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M12.04 2a9.9 9.9 0 0 0-8.46 15.04L2 22l5.1-1.53A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3.03.9.92-2.95-.2-.31a8.2 8.2 0 1 1 6.81 3.69Zm4.5-6.14c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.56.12-.16.25-.64.8-.79.97-.14.16-.29.19-.54.06a6.7 6.7 0 0 1-3.32-2.9c-.25-.43.25-.4.71-1.33.08-.16.04-.3-.02-.43l-.76-1.83c-.2-.48-.4-.41-.56-.42h-.48a.92.92 0 0 0-.66.31 2.78 2.78 0 0 0-.87 2.07 4.83 4.83 0 0 0 1.01 2.57 11.06 11.06 0 0 0 4.24 3.74c1.58.68 2.2.74 2.99.62.48-.07 1.46-.6 1.67-1.18.2-.58.2-1.08.14-1.18-.06-.1-.22-.17-.47-.29Z" />
    </svg>
  );
}

export function ChatButton({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const still = useReducedMotion() ?? false;
  const number = (useWhatsApp() || '').replace(/\D/g, '');
  const href = number ? `https://wa.me/${number}?text=${encodeURIComponent(c.hello)}` : `/${lang}/contact`;
  const [note, setNote] = React.useState(false);

  React.useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN) === '1';
    } catch {
      /* no storage: show it, once, for this page */
    }
    if (seen) return;
    const id = window.setTimeout(() => setNote(true), 6000);
    return () => window.clearTimeout(id);
  }, []);

  const dismiss = () => {
    setNote(false);
    try {
      sessionStorage.setItem(SEEN, '1');
    } catch {
      /* fine */
    }
  };

  const bubble = (
    <>
      {!still && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-emerald-400/40 [animation-duration:2.6s]" />}
      <span className="relative grid size-14 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_12px_30px_-8px_rgb(16_185_129/0.8)] transition-transform duration-300 group-hover:scale-105">
        <WhatsAppGlyph className="size-7" />
      </span>
    </>
  );

  return (
    <div className="fixed bottom-4 start-4 z-40 flex items-end gap-3 sm:bottom-6 sm:start-6">
      <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.2, type: 'spring', stiffness: 260, damping: 18 }}>
        {number ? (
          <a href={href} target="_blank" rel="noopener noreferrer" aria-label={c.label} className="group relative block" onClick={dismiss}>
            {bubble}
          </a>
        ) : (
          <Link href={href} aria-label={c.label} className="group relative block" onClick={dismiss}>
            {bubble}
          </Link>
        )}
      </motion.div>

      <AnimatePresence>
        {note && (
          <motion.div
            initial={{ opacity: 0, x: -10, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -10, scale: 0.95 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="relative mb-2 hidden max-w-[16rem] rounded-2xl border border-border bg-card/95 p-3 pe-8 text-sm shadow-lift backdrop-blur sm:block"
          >
            {number ? c.note : c.noteForm}
            <button type="button" onClick={dismiss} aria-label="Close" className="absolute end-1.5 top-1.5 rounded-full p-1 text-muted-foreground hover:bg-muted">
              <X className="size-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
