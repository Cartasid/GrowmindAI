import React from 'react';
import type { GrowMetadata } from '../types';

interface Props {
  grows: Record<string, GrowMetadata>;
  activeGrowId: string | null;
  onSelectGrow: (growId: string) => void;
  onCreateGrow: () => void;
  onDeleteGrow: (growId: string) => void;
}

const GrowOverview: React.FC<Props> = ({
  grows,
  activeGrowId,
  onSelectGrow,
  onCreateGrow,
  onDeleteGrow,
}) => {
  const growList = Object.entries(grows);

  return (
    <div className="p-4 bg-gray-800 text-white">
      <h2 className="text-xl font-bold mb-4">Grows</h2>
      <div className="space-y-2">
        {growList.length > 0 ? (
          growList.map(([id, meta]) => (
            <div
              key={id}
              className={`flex items-center justify-between p-2 rounded cursor-pointer ${
                id === activeGrowId ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
              }`}
              onClick={() => onSelectGrow(id)}
            >
              <div>
                <p className="font-semibold">{meta.name || 'Unnamed Grow'}</p>
                <p className="text-sm text-gray-400">{meta.startDate || 'No start date'}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Are you sure you want to delete "${meta.name}"?`)) {
                    onDeleteGrow(id);
                  }
                }}
                className="ml-4 px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs"
              >
                Delete
              </button>
            </div>
          ))
        ) : (
          <p className="text-gray-400">No grows found. Create one to get started!</p>
        )}
      </div>
      <button
        onClick={onCreateGrow}
        className="mt-4 w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-bold"
      >
        Create New Grow
      </button>
    </div>
  );
};

export default GrowOverview;
