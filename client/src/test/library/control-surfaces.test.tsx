import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { RangeSlider, Stepper, Switch } from '@library';

function ControlHarness() {
  const [enabled, setEnabled] = useState(false);

  return (
    <div>
      <Switch label="Enabled" checked={enabled} onCheckedChange={setEnabled} />
      <div>Switch value: {String(enabled)}</div>
      <div data-testid="range-slider-host">
        <RangeSlider label="Effort" min={0} max={100} value={[20, 80]} onChange={() => {}} />
      </div>
      <Stepper steps={['Draft', 'Review', 'Done']} activeStep={1} />
    </div>
  );
}

describe('library control surfaces', () => {
  it('uses semantic control surface tokens for switch, range slider, and stepper', async () => {
    const user = userEvent.setup();

    render(<ControlHarness />);

    const switchButton = screen.getByRole('switch', { name: 'Enabled' });
    const switchThumb = switchButton.querySelector('span');
    const sliderThumbs = screen.getByTestId('range-slider-host').querySelectorAll('[style*="background-color: var(--color-surface-overlay)"]');
    const reviewCircle = screen.getByText('Review').previousElementSibling as HTMLElement | null;

    expect(switchButton.getAttribute('style')).toContain('background-color: var(--color-surface-disabled)');
    expect(switchThumb?.getAttribute('style')).toContain('background-color: var(--color-surface-overlay)');

    await user.click(switchButton);
    expect(screen.getByText('Switch value: true')).toBeInTheDocument();
    expect(switchButton.getAttribute('style')).toContain('background-color: var(--color-primary)');

    expect(sliderThumbs).toHaveLength(2);
    expect(Array.from(sliderThumbs).every((thumb) => thumb.getAttribute('style')?.includes('border: 2px solid var(--color-primary)'))).toBe(true);

    expect(reviewCircle?.getAttribute('style')).toContain('color: var(--color-text-on-accent)');
  });
});