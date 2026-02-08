import { cn } from '@/lib/utils';

interface BadgeProps {
  variant?: 'default' | 'warning' | 'success' | 'outline';
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'bg-black/5 text-[color:var(--text-primary)] border border-[color:var(--border-subtle)]',
  warning: 'bg-amber-400/20 text-amber-600 dark:text-amber-200 border border-amber-300/50',
  success: 'bg-emerald-400/15 text-emerald-700 dark:text-emerald-200 border border-emerald-300/40',
  outline: 'border border-[color:var(--border-subtle)] text-[color:var(--text-primary)]',
};

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return <span className={cn('rounded-full px-3 py-1 text-xs font-medium', variantStyles[variant], className)}>{children}</span>;
}
