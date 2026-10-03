'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Play, X } from 'lucide-react';
import type { Lang } from '@/lib/site';
import { useSiteSettings } from '@/lib/live';

/** The YouTube id in a watch, short or embed link. */
function youtubeId(url: string) {
  const m = /(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{6,})/.exec(url);
  return m?.[1] ?? '';
}

/**
 * "Watch the 1-minute tour": the console's video (Website → One-minute tour),
 * played in a lightbox over the page. Hidden while no video is set.
 */
export function VideoTour({ lang }: { lang: Lang }) {
  const id = youtubeId(useSiteSettings().videoUrl);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);

  if (!id) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-2.5 text-sm font-semibold text-foreground"
      >
        <span className="relative grid size-10 place-items-center rounded-full bg-ramp text-white shadow-glow">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/30 [animation-duration:2.4s]" />
          <Play className="relative size-4 translate-x-px fill-current" />
        </span>
        {lang === 'bn' ? '১ মিনিটের ভিডিও দেখুন' : 'Watch the 1-minute tour'}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              className="relative aspect-video w-full max-w-4xl overflow-hidden rounded-2xl bg-black shadow-2xl"
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
            >
              <iframe
                className="absolute inset-0 size-full"
                src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
                title={lang === 'bn' ? 'Dawai ভিডিও' : 'Dawai tour'}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="absolute end-3 top-3 grid size-9 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
              >
                <X className="size-4" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
