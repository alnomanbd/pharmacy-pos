import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** The shadcn join: conditional classes, then let the later Tailwind utility win. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
