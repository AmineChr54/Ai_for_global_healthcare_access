'use client';

import type { Insight } from '@/types';
import { SlidePanel } from './slide-panel';
import { InsightList } from './insight-list';

interface InsightsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  insights: Insight[];
  facilityLookup?: Map<string, string>;
  onSelectFacility?: (facilityId: string) => void;
}

export function InsightsDrawer({ isOpen, onClose, insights, facilityLookup, onSelectFacility }: InsightsDrawerProps) {
  return (
    <SlidePanel title="Insights" isOpen={isOpen} onClose={onClose} widthClassName="w-[380px]">
      <div className="h-full overflow-y-auto pr-1">
        <InsightList insights={insights} facilityLookup={facilityLookup} onSelectFacility={onSelectFacility} />
      </div>
    </SlidePanel>
  );
}
