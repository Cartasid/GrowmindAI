import React from 'react';
import { HelpCircle } from './icons';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  className?: string;
}

const Tooltip: React.FC<TooltipProps> = ({ text, children, className = '' }) => {
  return (
    <div className={`relative group cursor-help ${className}`}>
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs p-2 text-sm text-white bg-black/80 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-black/80"></div>
      </div>
    </div>
  );
};

export const InfoTooltip: React.FC<{text: string}> = ({text}) => (
    <Tooltip text={text}>
        <HelpCircle className="w-4 h-4 text-muted" />
    </Tooltip>
);

export default Tooltip;

