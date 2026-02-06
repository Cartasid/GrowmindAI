import React, { useMemo } from 'react';
import type { Plan, Phase, Language } from '../types';
import { Calendar } from './icons';
import { getStageInfo, findScheduleIndexForDate, toLocalDateFromUTC, PlanScheduleEntry } from '../utils';

interface WeeklyPlanPanelProps {
  startDate?: string;
  currentPhase: Phase;
  plan: Plan;
  schedule: PlanScheduleEntry[];
  t: (key: string) => string;
  lang: Language;
}

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <div className={`bg-card border border-border rounded-xl p-4 sm:p-5 ${className}`}>
        {children}
    </div>
);

const WeeklyPlanPanel: React.FC<WeeklyPlanPanelProps> = ({ startDate, plan, schedule, t, lang }) => {
  const currentWeekIndex = useMemo(() => {
    if (!startDate || schedule.length === 0) return -1;
    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    return findScheduleIndexForDate(schedule, todayUTC);
  }, [startDate, schedule]);

  const renderContent = () => {
    if (!startDate || schedule.length === 0) {
      return (
        <div className="text-center text-muted py-8">
          <Calendar className="w-10 h-10 mx-auto mb-2" />
          <p>{t('weekly_plan_prompt')}</p>
        </div>
      );
    }

    const dateOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    const locale = lang === 'de' ? 'de-DE' : 'en-US';

    return (
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-2 text-center">
            {schedule.map((scheduleEntry, index) => {
                const weekStartDate = toLocalDateFromUTC(scheduleEntry.start);
                const isCurrent = index === currentWeekIndex;
                const stageInfo = getStageInfo(scheduleEntry.phase);
                const IconComponent = stageInfo.IconComponent;

                const cardClasses = isCurrent
                    ? `border-brand-a shadow-lg shadow-brand-a/20 bg-brand-a/10`
                    : `bg-black/20 border-transparent hover:border-muted/50`;

                return (
                    <div 
                        key={index} 
                        className={`relative rounded-lg p-2 transition-all duration-300 border flex flex-col items-center justify-center ${cardClasses}`}
                        style={{ borderTop: `4px solid ${stageInfo.color}` }}
                    >
                        <div className="flex items-center gap-1">
                            <IconComponent className="w-3 h-3 sm:w-4 sm:h-4" style={{ color: stageInfo.color }} />
                            <p className="font-bold text-xs sm:text-sm text-text-strong">
                                {t(`phases.${scheduleEntry.phase}`)}
                            </p>
                        </div>
                        <p className="text-xs text-muted font-mono mt-1">{weekStartDate.toLocaleDateString(locale, dateOptions)}</p>
                        {isCurrent && (
                             <span className="absolute -top-2 -right-2 block text-[10px] font-bold bg-brand-a text-bg px-1.5 py-0.5 rounded-full uppercase tracking-wider shadow-md">
                                {t('current_week')}
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
  };

  return (
    <Card>
      <h3 className="text-base font-bold text-text-strong mb-3 flex items-center gap-2">
        <Calendar className="w-5 h-5 text-brand-a" />
        {t('weekly_plan_title')}
      </h3>
      {renderContent()}
    </Card>
  );
};

export default WeeklyPlanPanel;