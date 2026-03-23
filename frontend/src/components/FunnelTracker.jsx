import React from 'react';
import { STAGE_COLORS, STAGES_ORDER } from '../utils/constants';

const FunnelTracker = ({ currentStage }) => {
  const currentIndex = STAGES_ORDER.indexOf(currentStage) === -1 ? 0 : STAGES_ORDER.indexOf(currentStage);

  return (
    <div className="flex items-center w-full my-4">
      {STAGES_ORDER.map((stage, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const colorStyle = STAGE_COLORS[stage];
        const label = stage.replace('_', ' ').toUpperCase();

        return (
          <React.Fragment key={stage}>
            <div className="flex flex-col items-center flex-shrink-0">
              <div 
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                  isCurrent ? 'shadow-[0_0_8px_rgba(255,255,255,0.4)]' : ''
                }`}
                style={{
                  backgroundColor: isCompleted || isCurrent ? colorStyle.text : 'transparent',
                  borderColor: isCompleted || isCurrent ? colorStyle.text : 'var(--color-border-subtle)',
                }}
              >
                {(isCompleted || isCurrent) && (
                  <div className="w-2 h-2 rounded-full bg-white opacity-80" />
                )}
              </div>
              <span 
                className="text-[0.6rem] mt-2 text-center whitespace-nowrap font-medium"
                style={{ color: isCurrent ? 'var(--color-text-white)' : 'var(--color-text-muted)' }}
              >
                {label}
              </span>
            </div>
            {index < STAGES_ORDER.length - 1 && (
              <div 
                className="flex-1 h-0.5 mx-2 transition-colors min-w-[12px]"
                style={{
                  backgroundColor: isCompleted ? STAGE_COLORS[STAGES_ORDER[index]].text : 'var(--color-border-subtle)'
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default FunnelTracker;
