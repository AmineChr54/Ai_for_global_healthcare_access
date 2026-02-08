'use client';

import { useMemo, useState } from 'react';
import type { Citation, FacilityWithDerived } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, formatConfidence } from '@/lib/utils';
import { Clipboard, Globe, Mail, MapPin, Phone, Shield, X } from 'lucide-react';

interface FacilityDetailDrawerProps {
  facility: FacilityWithDerived | null;
  citations: Citation[];
  onClose: () => void;
}

const tabs = ['Capabilities', 'Evidence', 'Anomalies', 'Notes'];

export function FacilityDetailDrawer({ facility, citations, onClose }: FacilityDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState('Capabilities');

  const facilityCitations = useMemo(() => citations.filter((citation) => citation.rowId === facility?.id), [citations, facility?.id]);

  if (!facility) return null;

  const copySummary = () => {
    const summary = `${facility.name} (${facility.type ?? 'Unknown type'}) in ${facility.region}. Capabilities: ${facility.capabilities ?? 'n/a'}. Equipment: ${facility.equipment ?? 'n/a'}. Flags: ${facility.flags.map((flag) => flag.message).join('; ') || 'none'}.`;
    navigator.clipboard.writeText(summary).catch(() => {});
  };

  return (
    <AnimatePresence>
      <motion.div
        key={facility.id}
        initial={{ x: 400, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 400, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed right-0 top-0 z-40 flex h-full w-[420px] flex-col border-l border-white/10 bg-surface-soft/95 p-6 text-sm"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Facility Insight</p>
            <h2 className="text-2xl font-semibold text-white">{facility.name}</h2>
            <p className="text-xs text-white/50">{facility.region}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-white/80">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-1">
              <Shield className="h-3 w-3 text-accent-blue" /> {facility.type ?? 'Unknown type'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-1">
              <MapPin className="h-3 w-3 text-amber-300" /> {facility.district ?? '—'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-1">
              Confidence {formatConfidence(facility.confidence)}
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            {facility.contact && (
              <Badge variant="outline" className="flex items-center gap-2">
                <Phone className="h-3 w-3" /> {facility.contact}
              </Badge>
            )}
            {facility.raw?.email && (
              <Badge variant="outline" className="flex items-center gap-2">
                <Mail className="h-3 w-3" /> {facility.raw.email}
              </Badge>
            )}
            {facility.raw?.officialWebsite && (
              <Badge variant="outline" className="flex items-center gap-2">
                <Globe className="h-3 w-3" /> {facility.raw.officialWebsite}
              </Badge>
            )}
          </div>
          <Button variant="secondary" size="sm" className="mt-3" onClick={copySummary}>
            <Clipboard className="mr-2 h-4 w-4" /> Copy summary
          </Button>
        </div>

        <div className="mt-4 flex gap-2 text-xs font-semibold text-white/60">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={cn(
                'flex-1 rounded-2xl border px-3 py-2 transition',
                activeTab === tab ? 'border-accent-blue bg-accent-blue/10 text-white' : 'border-white/10 hover:border-white/20'
              )}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <ScrollArea className="mt-4 flex-1">
          <div className="space-y-4 pr-2 text-white/70">
            {activeTab === 'Capabilities' && (
              <div>
                <p className="text-sm font-semibold text-white">Specialties</p>
                <p className="text-sm text-white/70">{facility.specialties ?? 'n/a'}</p>
                <p className="mt-3 text-sm font-semibold text-white">Capabilities</p>
                <p className="text-sm text-white/70">{facility.capabilities ?? 'n/a'}</p>
                <p className="mt-3 text-sm font-semibold text-white">Equipment</p>
                <p className="text-sm text-white/70">{facility.equipment ?? 'n/a'}</p>
              </div>
            )}
            {activeTab === 'Evidence' && (
              <div className="space-y-3">
                {facilityCitations.map((citation) => (
                  <div key={citation.id} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs">
                    <p className="text-white/60">{citation.snippet}</p>
                    <p className="mt-1 text-white/40">{citation.field}</p>
                  </div>
                ))}
                {!facilityCitations.length && <p className="text-sm text-white/50">No citations yet for this facility.</p>}
              </div>
            )}
            {activeTab === 'Anomalies' && (
              <div className="space-y-3">
                {facility.flags.map((flag) => (
                  <div key={flag.message} className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm">
                    {flag.message}
                  </div>
                ))}
                {!facility.flags.length && <p className="text-sm text-white/50">No anomaly flags.</p>}
              </div>
            )}
            {activeTab === 'Notes' && (
              <div>
                <p className="text-sm text-white/70">{facility.notes ?? 'No narrative notes yet.'}</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </motion.div>
    </AnimatePresence>
  );
}
