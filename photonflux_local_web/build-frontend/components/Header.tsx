import React from 'react';
import type { Language, Cultivar } from '../types';
import { CULTIVARS, I18N } from '../constants';
import { Settings, Printer, ArrowLeft } from './icons';
import Tooltip from './Tooltip';

interface HeaderProps {
  lang: Language;
  setLang: (lang: Language) => void;
  cultivar: Cultivar;
  setCultivar: (cultivar: Cultivar) => void;
  onConfigClick: () => void;
  onPrintClick: () => void;
  t: (key: string) => string;
  showBackButton?: boolean;
  onBackClick?: () => void;
  activeGrowName?: string;
}

const formatCultivarLabel = (value: string): string =>
  value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const Header: React.FC<HeaderProps> = ({
  lang, setLang, cultivar, setCultivar, onConfigClick, onPrintClick, t,
  showBackButton, onBackClick, activeGrowName
}) => {
  const translation = I18N[lang] as Record<string, any>;
  const cultivarLabels: Record<string, string> = translation?.cultivar_names || {};

  return (
    <header className="flex flex-wrap gap-2 justify-between items-center mb-4 sm:mb-6">
      <div className="flex items-center gap-4">
        {showBackButton && (
          <button
            onClick={onBackClick}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-brand-a"
            title={t('back_to_grows') || 'Back to Grows'}
          >
            <ArrowLeft className="w-8 h-8" />
          </button>
        )}
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-brand-a via-brand-b to-brand-c drop-shadow-[0_0_14px_rgba(34,211,238,0.45)]">
            {t('title')}
          </h1>
          {activeGrowName && (
            <p className="text-brand-b font-bold text-sm -mt-1">{activeGrowName}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
        <label className="flex gap-2 items-center font-mono text-sm">
          <span>{t('lang')}</span>
          <select
            id="lang"
            value={lang}
            onChange={(e) => setLang(e.target.value as Language)}
            className="w-auto bg-[#0c1424] text-text-strong border border-[#243251] rounded-lg p-2 focus:ring-2 focus:ring-brand-b focus:outline-none"
          >
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="flex gap-2 items-center font-mono text-sm">
          <span>{t('cultivar')}</span>
          <select
            id="cultivar"
            value={cultivar}
            onChange={(e) => setCultivar(e.target.value as Cultivar)}
            className="w-auto bg-[#0c1424] text-text-strong border border-[#243251] rounded-lg p-2 focus:ring-2 focus:ring-brand-b focus:outline-none"
          >
            {CULTIVARS.map((option) => (
              <option key={option} value={option}>
                {cultivarLabels[option] ?? formatCultivarLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <Tooltip text={t('tooltip_config')}>
          <button onClick={onConfigClick} className="btn-secondary flex items-center gap-2">
            <Settings className="w-4 h-4" />
            {t('config')}
          </button>
        </Tooltip>
        <Tooltip text={t('tooltip_print')}>
          <button onClick={onPrintClick} className="btn-secondary flex items-center gap-2">
            <Printer className="w-4 h-4" />
            {t('print')}
          </button>
        </Tooltip>
      </div>
    </header>
  );
};

// Inline styles to replace @apply which causes issues in browser-injected <style> tags
const style = document.createElement('style');
style.innerHTML = `
  .btn-primary {
    color: #050505;
    background: linear-gradient(to right, #00ffa3, #00d1ff, #0085ff);
    font-weight: 600;
    font-size: 0.875rem;
    transition: all 0.3s;
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    cursor: pointer;
    border: none;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .btn-primary:hover {
    background: linear-gradient(to right, #00ffa3, #00ffa3, #00d1ff);
  }
  .btn-secondary {
    color: #f8fafc;
    background-color: #0c1424;
    border: 1px solid #243251;
    font-weight: 600;
    font-size: 0.875rem;
    transition: all 0.3s;
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .btn-secondary:hover {
    background-color: #182337;
  }
`;
document.head.appendChild(style);

export default Header;