'use client';

import * as TogglePrimitive from '@radix-ui/react-toggle';
import { cn } from '@/lib/utils';

export interface ToggleProps extends React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root> {
  pressedClassName?: string;
}

export const Toggle = ({ className, pressedClassName, ...props }: ToggleProps) => (
  <TogglePrimitive.Root
    className={cn(
      'inline-flex items-center justify-center rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-white/70 transition data-[state=on]:border-accent-blue data-[state=on]:text-white data-[state=on]:bg-accent-blue/20',
      className,
      props.pressed && pressedClassName
    )}
    {...props}
  />
);
