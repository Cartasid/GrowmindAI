import React from 'react';
import type { JournalEntry } from '../types';
import { MessageSquare, Droplet, Bug, Scissors, HarvestIcon } from './icons';
import Tooltip from './Tooltip';

interface GrowthTimelineProps {
  entries: JournalEntry[];
  startDate: string;
  onSelectEntry: (entry: JournalEntry) => void;
}

const entryTypeIcons: Record<JournalEntry['entryType'], React.ReactNode> = {
  Observation: <MessageSquare />,
  Feeding: <Droplet />,
  Pest: <Bug />,
  Training: <Scissors />,
  Harvest: <HarvestIcon />,
};

const GrowthTimeline: React.FC<GrowthTimelineProps> = ({ entries, startDate, onSelectEntry }) => {
  const start = new Date(startDate).getTime();
  const end = new Date().getTime();
  const totalDuration = Math.max(1, (end - start) / (1000 * 60 * 60 * 24));

  const sortedEntries = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="p-4">
      <div className="relative h-24 bg-gray-800 rounded-full">
        {sortedEntries.map(entry => {
          const entryDate = new Date(entry.date).getTime();
          const position = ((entryDate - start) / (totalDuration * 1000 * 60 * 60 * 24)) * 100;
          return (
            <Tooltip key={entry.id} text={`${new Date(entry.date).toLocaleDateString()}: ${entry.notes.substring(0, 30)}...`}>
              <button
                onClick={() => onSelectEntry(entry)}
                className="absolute top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ left: `${position}%`, transform: `translate(-50%, -50%)`, background: '#334155' }}
              >
                {entryTypeIcons[entry.entryType]}
              </button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
};

export default GrowthTimeline;