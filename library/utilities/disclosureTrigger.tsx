import React from 'react';
import { Button } from '../components/button/Button';

interface DisclosureTriggerProps {
  /** Non-interactive content or an existing button. */
  trigger: React.ReactNode;
  asChild?: boolean;
  id?: string;
  isOpen: boolean;
  contentId: string;
  hasPopup?: 'dialog';
  onToggle: () => void;
}

function getTriggerButton(trigger: React.ReactNode, asChild = false) {
  return React.isValidElement<React.ButtonHTMLAttributes<HTMLButtonElement>>(trigger)
    && trigger.type !== React.Fragment
    && (trigger.type === 'button' || trigger.type === Button || asChild)
    ? trigger : null;
}

export function useDisclosureTriggerId(trigger: React.ReactNode, asChild = false) {
  const generatedId = React.useId();
  return getTriggerButton(trigger, asChild)?.props.id || generatedId;
}

/** Compose an existing button without nesting controls or replacing its ref. */
export function DisclosureTrigger({ trigger, asChild = false, id, isOpen, contentId, hasPopup, onToggle }: DisclosureTriggerProps) {
  const button = getTriggerButton(trigger, asChild);
  const props: React.ButtonHTMLAttributes<HTMLButtonElement> = {
    id: button?.props.id || id,
    type: 'button',
    'aria-expanded': isOpen,
    'aria-controls': isOpen ? contentId : undefined,
    'aria-haspopup': hasPopup ?? button?.props['aria-haspopup'],
    className: [button?.props.className, 'lib-focus-ring'].filter(Boolean).join(' '),
    onClick: (event) => {
      if (button?.props.disabled || button?.props['aria-disabled'] === true || button?.props['aria-disabled'] === 'true') return;
      button?.props.onClick?.(event);
      if (!event.defaultPrevented) onToggle();
    },
  };

  if (button) return React.cloneElement(button, props);

  return <button {...props} style={{
    display: 'inline-flex', alignItems: 'center', font: 'inherit', color: 'inherit',
    background: 'none', border: 0, padding: 0, cursor: 'pointer',
  }}>{trigger}</button>;
}

/** The root also receives keyboard events from React portals. */
export function dismissDisclosureOnEscape(event: React.KeyboardEvent<HTMLElement>, isOpen: boolean, close: () => void) {
  if (event.key !== 'Escape' || event.defaultPrevented || !isOpen) return;
  event.preventDefault();
  event.stopPropagation();
  const trigger = event.currentTarget.querySelector<HTMLButtonElement>('button[aria-expanded]');
  close();
  trigger?.focus();
}
