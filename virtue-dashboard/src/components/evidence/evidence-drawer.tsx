'use client';

import { Fragment } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Tab } from '@headlessui/react';
import type { AgentResult, Citation, AgentTraceStep } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ListTree, NotebookPen, Quote, X } from 'lucide-react';

type EvidenceTab = 'evidence' | 'trace' | 'planner';

interface EvidenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  agentResult: AgentResult | null;
  planSlot: React.ReactNode;
  activeTab: EvidenceTab;
  onTabChange: (tab: EvidenceTab) => void;
}

const tabs: Array<{ id: EvidenceTab; label: string; icon: typeof Quote }> = [
  { id: 'evidence', label: 'Evidence', icon: Quote },
  { id: 'trace', label: 'Trace', icon: ListTree },
  { id: 'planner', label: 'Planner', icon: NotebookPen },
];

export function EvidenceDrawer({ isOpen, onClose, agentResult, planSlot, activeTab, onTabChange }: EvidenceDrawerProps) {
  const tabOrder: EvidenceTab[] = ['evidence', 'trace', 'planner'];
  const selectedIndex = tabOrder.indexOf(activeTab);
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ x: 420, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 420, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 30 }}
          className="fixed right-6 top-6 z-50 flex h-[calc(100vh-3rem)] w-[420px] flex-col rounded-3xl border border-white/10 bg-surface-glass p-4 shadow-glass"
        >
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/40">Evidence & Trace</p>
              <p className="text-sm text-white/60">Premium audit trail for leadership reviews.</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <Tab.Group selectedIndex={selectedIndex === -1 ? 0 : selectedIndex} onChange={(index) => onTabChange(tabOrder[index] ?? 'evidence')}>
            <Tab.List className="mb-4 grid grid-cols-3 gap-2">
              {tabs.map((tab) => (
                <Tab key={tab.id} as={Fragment}>
                  {({ selected }) => (
                    <button
                      className={cn(
                        'flex items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition',
                        selected
                          ? 'border-accent-blue bg-accent-blue/10 text-white'
                          : 'border-white/10 text-white/60 hover:border-white/30'
                      )}
                    >
                      <tab.icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  )}
                </Tab>
              ))}
            </Tab.List>

            <Tab.Panels className="flex-1 overflow-hidden">
              <Tab.Panel className="h-full">
                <ScrollArea className="h-full">
                  <div className="space-y-3 pr-2">
                    {agentResult?.citations.map((citation) => (
                      <div key={citation.id} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
                        <p className="text-xs uppercase tracking-wide text-white/50">{citation.field}</p>
                        <p className="mt-1 text-white/80">{citation.snippet}</p>
                        <div className="mt-2 flex items-center justify-between text-xs text-white/50">
                          <span>Row {citation.rowId}</span>
                          <Badge variant="outline">Confidence {Math.round(citation.confidence * 100)}%</Badge>
                        </div>
                      </div>
                    ))}
                    {!agentResult?.citations.length && (
                      <p className="text-sm text-white/50">Run a query to populate citation trace.</p>
                    )}
                  </div>
                </ScrollArea>
              </Tab.Panel>
              <Tab.Panel className="h-full">
                <ScrollArea className="h-full">
                  <div className="space-y-4 pr-2">
                    {agentResult?.trace.map((step) => (
                      <div key={step.stepName} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-white">{step.stepName}</p>
                          <Badge variant="outline">{step.inputRefs.join(', ')}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-white/70">{step.output}</p>
                        <div className="mt-2 space-y-1 text-xs text-white/60">
                          {step.citations.map((citation) => (
                            <p key={citation.id}>
                              → {citation.snippet} ({Math.round(citation.confidence * 100)}%)
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                    {!agentResult?.trace.length && <p className="text-sm text-white/50">Trace available after first run.</p>}
                  </div>
                </ScrollArea>
              </Tab.Panel>
              <Tab.Panel className="h-full overflow-hidden">{planSlot}</Tab.Panel>
            </Tab.Panels>
          </Tab.Group>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
