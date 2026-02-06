import React, { useState, useMemo } from 'react';
import type { JournalEntry, Phase } from '../types';

interface PhotoGalleryProps {
  entries: JournalEntry[];
  onSelectEntry: (entry: JournalEntry) => void;
}

const PhotoGallery: React.FC<PhotoGalleryProps> = ({ entries, onSelectEntry }) => {
  const [filterPhase, setFilterPhase] = useState<Phase | 'all'>('all');
  const [filterAiOnly, setFilterAiOnly] = useState(false);

  const allImages = useMemo(() => {
    return entries.flatMap(entry =>
      entry.images.map(image => ({
        ...entry,
        image,
      }))
    );
  }, [entries]);

  const filteredImages = useMemo(() => {
    return allImages.filter(item => {
      if (filterPhase !== 'all' && item.phase !== filterPhase) {
        return false;
      }
      if (filterAiOnly && !item.aiAnalysisResult) {
        return false;
      }
      return true;
    });
  }, [allImages, filterPhase, filterAiOnly]);

  const availablePhases = useMemo(() => {
    const phases = new Set<Phase>();
    entries.forEach(entry => phases.add(entry.phase));
    return Array.from(phases);
  }, [entries]);

  return (
    <div className="p-4">
      <div className="flex gap-4 mb-4">
        <select value={filterPhase} onChange={e => setFilterPhase(e.target.value as Phase | 'all')}>
          <option value="all">Alle Phasen</option>
          {availablePhases.map(phase => (
            <option key={phase} value={phase}>{phase}</option>
          ))}
        </select>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={filterAiOnly} onChange={e => setFilterAiOnly(e.target.checked)} />
          Nur mit KI-Analyse
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {filteredImages.map((item, index) => (
          <button key={`${item.id}-${index}`} onClick={() => onSelectEntry(item)}>
            <img src={item.image} alt={`Eintrag vom ${new Date(item.date).toLocaleDateString()}`} className="w-full h-full object-cover rounded" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default PhotoGallery;