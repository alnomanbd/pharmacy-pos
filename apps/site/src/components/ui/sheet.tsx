'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The mobile menu. A right-hand sheet, because a pharmacy's menu is a list of places.
 * It sits above everything fixed on the page — the announcement rail included —
 * so its own header and close button are never covered.
 */
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetTitle = DialogPrimitive.Title;
const SheetDescription = DialogPrimitive.Description;

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: 'right' | 'left'; closeLabel?: string }
>(({ className, children, side = 'right', closeLabel = 'Close', ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-ink-950/55 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-y-0 z-[70] flex w-[86vw] max-w-sm flex-col border-border bg-background shadow-lift outline-none',
        side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
        'data-[state=closed]:animate-out data-[state=open]:animate-in',
        side === 'right'
          ? 'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right'
          : 'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        aria-label={closeLabel}
        className="absolute right-4 top-4 grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-5" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = 'SheetContent';

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle, SheetDescription };
