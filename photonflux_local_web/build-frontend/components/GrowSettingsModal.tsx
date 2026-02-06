import React, { useState, useEffect, useMemo } from 'react';
import { Grow, HASensorMapping } from '../types';
import { X, Save, Activity, Loader } from './icons';

interface GrowSettingsModalProps {
  grow: Grow;
  onSave: (updatedGrow: Grow) => void;
  onClose: () => void;
  t: (key: string) => string;
}

interface HAEntity {
  entity_id: string;
  attributes: {
    friendly_name?: string;
  };
}

const GrowSettingsModal: React.FC<GrowSettingsModalProps> = ({ grow, onSave, onClose, t }) => {
  const [mapping, setMapping] = useState<HASensorMapping>(grow.settings?.haSensorMapping || {});
  const [entities, setEntities] = useState<HAEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchEntities = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('api/ha/entities');
      const data = await res.json();
      if (res.ok) {
        setEntities(data);
      } else {
        setError(data.error || `Error ${res.status}`);
      }
    } catch (err) {
      console.error('Failed to fetch HA entities', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntities();
  }, []);

  const handleSave = () => {
    onSave({
      ...grow,
      settings: {
        ...grow.settings,
        haSensorMapping: mapping
      }
    });
  };

  const updateMapping = (key: keyof HASensorMapping, value: string) => {
    setMapping(prev => ({ ...prev, [key]: value }));
  };

  const metrics: { key: keyof HASensorMapping; label: string }[] = [
    { key: 'temp', label: t('journal_temp') },
    { key: 'humidity', label: t('journal_humidity') },
    { key: 'ec', label: t('journal_ec') },
    { key: 'ph', label: t('journal_ph') },
    { key: 'ppfd', label: 'PPFD' },
    { key: 'co2', label: 'CO2' },
    { key: 'rootTemp', label: t('journal_root_temp') || 'Wurzeltemp' },
    { key: 'leafTemp', label: t('journal_leaf_temp') },
    { key: 'vpd', label: t('journal_vpd') },
    { key: 'vwc', label: t('journal_vwc') },
    { key: 'soilEc', label: t('journal_soil_ec') },
  ];

  const filteredEntities = useMemo(() => {
    if (!searchTerm) return entities;
    const lower = searchTerm.toLowerCase();
    return entities.filter(e =>
      e.entity_id.toLowerCase().includes(lower) ||
      e.attributes?.friendly_name?.toLowerCase().includes(lower)
    );
  }, [entities, searchTerm]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[60] backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl bg-[#0e1728] border border-border rounded-xl flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex justify-between items-center p-6 border-b border-border">
          <h2 className="text-xl font-bold text-text-strong flex items-center gap-2">
            <Activity className="w-6 h-6 text-brand-a" />
            {t('grow_settings') || 'Grow Settings'} - {grow.name}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-6 h-6" /></button>
        </header>

        <div className="p-6 overflow-y-auto max-h-[70vh]">
          <h3 className="text-lg font-semibold mb-4 text-brand-b">{t('ha_integration_title') || 'Home Assistant Integration'}</h3>
          <p className="text-sm text-muted mb-4">{t('ha_integration_desc') || 'Map metrics to Home Assistant entities to automatically fetch current values when creating journal entries.'}</p>

          <div className="mb-6">
            <input
              type="text"
              className="w-full bg-bg border border-border rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-brand-b outline-none"
              placeholder={t('search_entities') || 'Suche Entitäten...'}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted">
              <Loader className="w-8 h-8 animate-spin mx-auto mb-2 text-brand-b" />
              {t('loading_entities') || 'Loading entities...'}
            </div>
          ) : error ? (
            <div className="text-center py-8 p-4 bg-red-500/10 border border-red-500/50 rounded-lg">
              <p className="text-red-400 mb-4 font-mono text-sm">{error}</p>
              <button onClick={fetchEntities} className="btn-secondary">{t('retry') || 'Retry'}</button>
            </div>
          ) : (
            <div className="space-y-4">
              {metrics.map(m => (
                <div key={m.key} className="grid grid-cols-3 items-center gap-4">
                  <label className="text-sm font-medium">{m.label}</label>
                  <select
                    className="col-span-2 bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-b outline-none"
                    value={mapping[m.key] || ''}
                    onChange={e => updateMapping(m.key, e.target.value)}
                  >
                    <option value="">{t('manual_input') || 'Manual Input'}</option>
                    {Array.isArray(filteredEntities) && filteredEntities.map(e => (
                      <option key={e.entity_id} value={e.entity_id}>
                        {e.attributes?.friendly_name || e.entity_id} ({e.entity_id})
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="p-6 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">{t('cancel')}</button>
          <button onClick={handleSave} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" />
            {t('save_settings') || 'Save Settings'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default GrowSettingsModal;
