import React, { useState, useLayoutEffect } from 'react';
import { ArrowRight } from './icons';

interface OnboardingStep {
  selector: string;
  title: string;
  content: string;
}

interface OnboardingGuideProps {
  steps: OnboardingStep[];
  stepIndex: number;
  onNext: () => void;
  onSkip: () => void;
  t: (key: string) => string;
}

const OnboardingGuide: React.FC<OnboardingGuideProps> = ({ steps, stepIndex, onNext, onSkip, t }) => {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const currentStep = steps[stepIndex];

  useLayoutEffect(() => {
    // This function finds the target element, scrolls it into view, and sets its position.
    const updatePosition = () => {
      // Return early if there's no current step
      if (!currentStep) return;

      const element = document.querySelector(currentStep.selector);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        
        // A timeout gives the smooth scroll animation time to finish before we measure the element's position.
        const scrollTimeout = setTimeout(() => {
          setTargetRect(element.getBoundingClientRect());
        }, 350);

        return () => clearTimeout(scrollTimeout);
      } else {
        // If an element can't be found, log a warning and automatically move to the next step.
        console.warn(`Onboarding element not found: ${currentStep.selector}`);
        onNext();
      }
    };
    
    // Set a timeout to ensure the main UI is painted before trying to find elements
    const renderTimeout = setTimeout(updatePosition, 100);

    window.addEventListener('resize', updatePosition);
    return () => {
        clearTimeout(renderTimeout);
        window.removeEventListener('resize', updatePosition);
    };
  }, [currentStep, onNext]);

  // Don't render the guide until we have the target element's position.
  if (!targetRect) {
    return (
        <div className="fixed inset-0 bg-black/70 z-[100] transition-opacity duration-300"></div>
    );
  }

  const tooltipStyle: React.CSSProperties = {};
  const isLastStep = stepIndex === steps.length - 1;

  // Position tooltip below the element, unless there isn't enough space, then position it above.
  if (targetRect.bottom + 200 > window.innerHeight) {
    tooltipStyle.bottom = `${window.innerHeight - targetRect.top + 16}px`;
  } else {
    tooltipStyle.top = `${targetRect.bottom + 16}px`;
  }
  
  // Horizontally center the tooltip relative to the target element.
  tooltipStyle.left = `${targetRect.left + targetRect.width / 2}px`;
  tooltipStyle.transform = 'translateX(-50%)';

  // Make sure the tooltip doesn't go off the screen horizontally.
  const tooltipWidth = 320; // Corresponds to w-80
  if (targetRect.left + targetRect.width / 2 - tooltipWidth / 2 < 16) {
    tooltipStyle.left = '16px';
    tooltipStyle.transform = 'translateX(0)';
  }
  if (targetRect.left + targetRect.width / 2 + tooltipWidth / 2 > window.innerWidth - 16) {
    tooltipStyle.left = 'auto';
    tooltipStyle.right = '16px';
    tooltipStyle.transform = 'translateX(0)';
  }


  return (
    <div className="fixed inset-0 z-[100]">
      {/* Highlight Box with "hole-punch" overlay effect */}
      <div
        className="absolute transition-all duration-300 pointer-events-none rounded-lg"
        style={{
          left: targetRect.left - 4,
          top: targetRect.top - 4,
          width: targetRect.width + 8,
          height: targetRect.height + 8,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.7), 0 0 0 4px #7C4DFF',
        }}
        aria-hidden="true"
      ></div>

      {/* Tooltip Content Box */}
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-content"
        className="absolute w-80 max-w-[calc(100vw-32px)] bg-card border border-border rounded-xl p-4 shadow-2xl transition-all duration-300"
        style={tooltipStyle}
      >
        <div className="flex justify-between items-center mb-2">
            <h4 id="onboarding-title" className="font-bold text-text-strong">{currentStep.title}</h4>
            <span className="text-sm text-muted font-mono" aria-hidden="true">{stepIndex + 1} / {steps.length}</span>
        </div>
        <p id="onboarding-content" className="text-sm text-muted">{currentStep.content}</p>
        <div className="flex justify-between items-center mt-4">
          <button onClick={onSkip} className="text-sm text-muted hover:text-white transition-colors">
            {t('onboarding_skip')}
          </button>
          <button onClick={isLastStep ? onSkip : onNext} className="btn-primary flex items-center gap-2">
            {isLastStep ? t('onboarding_finish') : t('onboarding_next')}
            {!isLastStep && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingGuide;