'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface SlidePanelProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  widthClassName?: string;
}

export function SlidePanel({ title, isOpen, onClose, children, widthClassName = 'w-[360px]' }: SlidePanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          className={`fixed right-5 top-5 z-50 flex h-[calc(100vh-2.5rem)] flex-col rounded-3xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-panel)] p-4 shadow-glass ${widthClassName}`}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[color:var(--text-primary)]">{title}</p>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-4 flex-1 overflow-visible">{children}</div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
