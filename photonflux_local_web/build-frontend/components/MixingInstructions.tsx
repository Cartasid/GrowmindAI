import React, { useState } from 'react';
import { ChevronDown, WaterDrop, RotateCcw, PlusCircle, Clock, Zap, FlaskConical } from './icons';

interface MixingInstructionsProps {
  t: (key: string) => string;
}

const InstructionStep: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
    <li className="flex items-start gap-3 mt-2">
        <div className="flex-shrink-0 w-5 h-5 text-cyan-400 mt-0.5">{icon}</div>
        <span className="text-muted flex-1">{text}</span>
    </li>
);

const MixingInstructions: React.FC<MixingInstructionsProps> = ({ t }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-card border border-border rounded-xl">
      <button
        className="w-full flex justify-between items-center p-4 text-left"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="mixing-instructions-content"
      >
        <h3 className="text-xl font-bold text-text-strong">{t('mixing_title')}</h3>
        <ChevronDown className={`w-6 h-6 text-muted transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      <div 
        id="mixing-instructions-content"
        className={`overflow-hidden transition-all duration-500 ease-in-out ${isOpen ? 'max-h-[1500px]' : 'max-h-0'}`}
      >
        <div className="px-4 pb-4">
          <h4 className="text-lg font-semibold mt-4 text-cyan-300 flex items-center gap-2"><WaterDrop className="w-5 h-5" />{t('mixing_prep_title')}</h4>
          <p className="text-muted pl-7">{t('mixing_prep_text1')}</p>
          
          <h4 className="text-lg font-semibold mt-4 text-cyan-300 flex items-center gap-2"><FlaskConical className="w-5 h-5"/>{t('mixing_ph_title')}</h4>
          <p className="text-muted pl-7 mt-4">{t('mixing_ph_text1')}</p>

          <div className="grid md:grid-cols-2 gap-6 mt-4">
            <div>
              <h4 className="text-lg font-semibold text-green-300">{t('mixing_veg_title')}</h4>
              <ul className="space-y-1 mt-2">
                <InstructionStep icon={<PlusCircle/>} text={t('mixing_veg_step1')} />
                <InstructionStep icon={<PlusCircle/>} text={t('mixing_veg_step2')} />
                <InstructionStep icon={<PlusCircle/>} text={t('mixing_veg_step3')} />
                <InstructionStep icon={<Zap />} text={t('mixing_veg_step4')} />
              </ul>
            </div>
            <div>
              <h4 className="text-lg font-semibold text-amber-300">{t('mixing_bloom_title')}</h4>
              <ul className="space-y-1 mt-2">
                <InstructionStep icon={<PlusCircle />} text={t('mixing_bloom_step1')} />
                <InstructionStep icon={<PlusCircle />} text={t('mixing_bloom_step2')} />
                <InstructionStep icon={<PlusCircle />} text={t('mixing_bloom_step3')} />
                <InstructionStep icon={<PlusCircle />} text={t('mixing_bloom_step4')} />
                <InstructionStep icon={<Zap />} text={t('mixing_bloom_step5')} />
              </ul>
            </div>
          </div>
          
          <h4 className="text-lg font-semibold mt-4 text-cyan-300 flex items-center gap-2"><Clock className="w-5 h-5" />{t('mixing_checks_title')}</h4>
          <ul className="space-y-1 mt-2">
             <InstructionStep icon={<Clock />} text={t('mixing_checks_step1')} />
             <InstructionStep icon={<RotateCcw />} text={t('mixing_checks_step2')} />
          </ul>
        </div>
      </div>
    </div>
  );
};

export default MixingInstructions;