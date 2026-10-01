'use client';

import * as React from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The FAQ. The `+` rotates into a `−` on the open panel, and the whole row is
 * the trigger — on a phone a shop owner is reading this one-handed at a
 * counter, so a 44px target that is only the icon is not a target.
 */
const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn(
      'group overflow-hidden rounded-3xl border border-border/70 bg-card/60 backdrop-blur transition-colors duration-300 data-[state=open]:border-primary/30 data-[state=open]:bg-card',
      className,
    )}
    {...props}
  />
));
AccordionItem.displayName = 'AccordionItem';

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex flex-1 items-start justify-between gap-6 px-6 py-5 text-left text-base font-semibold tracking-[-0.01em] transition-colors hover:text-primary sm:px-7 sm:py-6 sm:text-lg',
        className,
      )}
      {...props}
    >
      {children}
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-border bg-muted/60 text-muted-foreground transition-all duration-300 ease-spring group-hover:border-primary/40 group-hover:text-primary group-data-[state=open]:rotate-45 group-data-[state=open]:border-primary group-data-[state=open]:bg-primary group-data-[state=open]:text-primary-foreground">
        <Plus className="size-4" />
      </span>
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = 'AccordionTrigger';

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    <div
      className={cn(
        'measure px-6 pb-6 text-[0.95rem] leading-relaxed text-muted-foreground sm:px-7 sm:pb-7',
        className,
      )}
    >
      {children}
    </div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = 'AccordionContent';

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
