import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Portal } from '../utilities/Portal';
import { ClickAwayListener } from '../utilities/ClickAwayListener';

export interface StepperProps {
  steps: string[];
  activeStep: number;
  style?: React.CSSProperties;
}

export function Stepper({ steps, activeStep, style }: StepperProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', ...style }}>
      {steps.map((step, idx) => {
        const isCompleted = idx < activeStep;
        const isActive = idx === activeStep;
        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', flex: idx < steps.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: isCompleted || isActive ? 'var(--accent-solid)' : 'var(--border)',
                  color: isCompleted || isActive ? '#ffffff' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
              >
                {idx + 1}
              </div>
              <span
                style={{
                  fontSize: '13px',
                  color: isActive ? 'var(--text-heading)' : 'var(--text-muted)',
                  fontWeight: isActive ? 500 : 400,
                }}
              >
                {step}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                style={{
                  height: '2px',
                  backgroundColor: isCompleted ? 'var(--accent-solid)' : 'var(--border)',
                  flexGrow: 1,
                  margin: '0 12px',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
