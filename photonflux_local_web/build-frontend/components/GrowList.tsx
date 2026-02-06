import React, { useState, useEffect } from 'react';
import { Grow, Cultivar, Substrate } from '../types';
import { getGrows, addGrow, deleteGrow, updateGrow, syncGrows } from '../services/growService';
import { Plus, Trash2, Edit, Calendar, LeafIcon, ArrowRight, BarChart, X, Settings } from './icons';
import { CULTIVARS, SUBSTRATES } from '../constants';
import GrowSettingsModal from './GrowSettingsModal';

interface GrowListProps {
  onSelectGrow: (grow: Grow) => void;
  onCompareGrows: (growIds: string[]) => void;
  t: (key: string) => string;
  lang: string;
}

const GrowList: React.FC<GrowListProps> = ({ onSelectGrow, onCompareGrows, t, lang }) => {
  const [grows, setGrows] = useState<Grow[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [settingsGrow, setSettingsGrow] = useState<Grow | null>(null);
  const [newGrow, setNewGrow] = useState<Partial<Grow>>({
    name: '',
    cultivar: CULTIVARS[0],
    substrate: SUBSTRATES[0],
    startDate: new Date().toISOString().split('T')[0],
    status: 'active'
  });
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);

  useEffect(() => {
    const loadGrows = async () => {
      const data = await syncGrows();
      setGrows(data);
    };
    loadGrows();
  }, []);

  const handleAddGrow = async () => {
    if (!newGrow.name || !newGrow.cultivar || !newGrow.substrate || !newGrow.startDate) return;
    const added = await addGrow(newGrow as Omit<Grow, 'id'>);
    setGrows([...grows, added]);
    setIsAdding(false);
    setNewGrow({
      name: '',
      cultivar: CULTIVARS[0],
      substrate: SUBSTRATES[0],
      startDate: new Date().toISOString().split('T')[0],
      status: 'active'
    });
  };

  const handleUpdateGrow = async (updated: Grow) => {
    await updateGrow(updated);
    setGrows(grows.map(g => g.id === updated.id ? updated : g));
    setSettingsGrow(null);
  };

  const handleDeleteGrow = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(t('grow_delete_confirm') || 'Delete this grow?')) {
      await deleteGrow(id);
      setGrows(grows.filter(g => g.id !== id));
    }
  };

  const toggleCompare = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedForCompare(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-xl w-full">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-text-strong">{t('grow_manager_title') || 'Grow Manager'}</h2>
        <div className="flex gap-2">
           {selectedForCompare.length > 1 && (
             <button
                onClick={() => onCompareGrows(selectedForCompare)}
                className="btn-secondary flex items-center gap-2 border-brand-b text-brand-b"
             >
                <BarChart className="w-4 h-4"/>
                {t('compare_grows') || 'Compare Selected'} ({selectedForCompare.length})
             </button>
           )}
           <button onClick={() => setIsAdding(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            {t('new_grow') || 'New Grow'}
          </button>
        </div>
      </div>

      {isAdding && (
        <div className="mb-8 p-6 bg-black/20 rounded-xl border border-brand-b/30 animate-in fade-in slide-in-from-top-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-text-strong">{t('add_new_grow') || 'Add New Grow'}</h3>
            <button onClick={() => setIsAdding(false)}><X className="w-5 h-5"/></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('grow_name') || 'Grow Name'}</label>
              <input
                type="text"
                className="w-full bg-bg border border-border rounded-lg px-4 py-2"
                value={newGrow.name}
                onChange={e => setNewGrow({...newGrow, name: e.target.value})}
                placeholder="e.g. Summer Tent 2024"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('start_date')}</label>
              <input
                type="date"
                className="w-full bg-bg border border-border rounded-lg px-4 py-2"
                value={newGrow.startDate}
                onChange={e => setNewGrow({...newGrow, startDate: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('cultivar')}</label>
              <select
                className="w-full bg-bg border border-border rounded-lg px-4 py-2"
                value={newGrow.cultivar}
                onChange={e => setNewGrow({...newGrow, cultivar: e.target.value as Cultivar})}
              >
                {CULTIVARS.map(c => <option key={c} value={c}>{t(`cultivar_names.${c}`)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('substrate')}</label>
              <select
                className="w-full bg-bg border border-border rounded-lg px-4 py-2"
                value={newGrow.substrate}
                onChange={e => setNewGrow({...newGrow, substrate: e.target.value as Substrate})}
              >
                {SUBSTRATES.map(s => <option key={s} value={s}>{t(`substrate_names.${s}`)}</option>)}
              </select>
            </div>
          </div>
          <button onClick={handleAddGrow} className="btn-primary w-full mt-6">
            {t('start_grow') || 'Start Grow'}
          </button>
        </div>
      )}

      <div className="grid gap-4">
        {grows.length === 0 ? (
          <div className="text-center py-12 text-muted bg-black/10 rounded-xl border border-dashed border-border">
            {t('no_grows_found') || 'No grows started yet. Click "New Grow" to begin.'}
          </div>
        ) : grows.map(grow => (
          <div
            key={grow.id}
            onClick={() => onSelectGrow(grow)}
            className="group relative bg-card border border-border hover:border-brand-b/50 rounded-xl p-5 cursor-pointer transition-all duration-300 hover:shadow-lg hover:bg-white/5"
          >
            <div className="flex justify-between items-start">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-full ${grow.status === 'active' ? 'bg-brand-a/20 text-brand-a' : 'bg-muted/20 text-muted'}`}>
                  <LeafIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-text-strong group-hover:text-brand-b transition-colors">{grow.name}</h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted mt-1">
                    <span className="flex items-center gap-1"><Calendar className="w-4 h-4"/> {new Date(grow.startDate).toLocaleDateString(lang)}</span>
                    <span className="capitalize">{t(`cultivar_names.${grow.cultivar}`)} · {t(`substrate_names.${grow.substrate}`)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                   onClick={(e) => { e.stopPropagation(); setSettingsGrow(grow); }}
                   className="p-2 text-muted hover:text-brand-a hover:bg-white/10 rounded-lg transition-all"
                   title={t('grow_settings')}
                >
                  <Settings className="w-5 h-5" />
                </button>
                <button
                   onClick={(e) => toggleCompare(grow.id, e)}
                   className={`p-2 rounded-lg transition-colors ${selectedForCompare.includes(grow.id) ? 'bg-brand-b/20 text-brand-b' : 'text-muted hover:bg-white/10'}`}
                   title={t('toggle_compare') || 'Toggle Compare'}
                >
                    <BarChart className="w-5 h-5" />
                </button>
                <button
                  onClick={(e) => handleDeleteGrow(grow.id, e)}
                  className="p-2 text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <div className="p-2 text-muted group-hover:text-brand-b group-hover:translate-x-1 transition-all">
                  <ArrowRight className="w-6 h-6" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {settingsGrow && (
        <GrowSettingsModal
          grow={settingsGrow}
          onSave={handleUpdateGrow}
          onClose={() => setSettingsGrow(null)}
          t={t}
        />
      )}
    </div>
  );
};

export default GrowList;
