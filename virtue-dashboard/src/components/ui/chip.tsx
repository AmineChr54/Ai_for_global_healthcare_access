import { cn } from '@/lib/utils';

interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function Chip({ active, className, children, ...props }: ChipProps) {
  return (
    <button
      className={cn(
        'rounded-full border px-4 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/80',
        active ? 'border-accent-blue/60 bg-accent-blue/10 text-white' : 'border-white/10 text-white/70 hover:text-white hover:border-white/30',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
