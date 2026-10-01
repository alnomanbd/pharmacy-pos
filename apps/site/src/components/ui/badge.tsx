import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-2xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        ramp: 'border-transparent bg-ramp text-white',
        outline: 'border-border text-muted-foreground',
        soft: 'border-primary/20 bg-primary/10 text-primary',
        glass: 'border-white/50 bg-white/60 text-foreground backdrop-blur',
        warning: 'border-warning/25 bg-warning/12 text-warning',
        success: 'border-success/25 bg-success/12 text-success',
        danger: 'border-destructive/25 bg-destructive/10 text-destructive',
        ink: 'border-white/12 bg-white/[0.06] text-foreground backdrop-blur',
      },
    },
    defaultVariants: { variant: 'soft' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
