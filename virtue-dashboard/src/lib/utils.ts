import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatConfidence(value?: number) {
  if (value === undefined || Number.isNaN(value)) return 'n/a';
  return `${Math.round(value * 100)}%`;
}

export function timeAgo(dateString?: string) {
  if (!dateString) return 'Unknown';
  try {
    return formatDistanceToNowStrict(parseISO(dateString), { addSuffix: true });
  } catch (error) {
    return dateString;
  }
}

export function randomId(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
