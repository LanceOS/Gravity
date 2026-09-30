import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Avatar, AvatarUpload } from '@library';

describe('avatar accessibility', () => {
  it('keeps avatar image alt text and hides the decorative fallback icon', () => {
    const { container } = render(
      <>
        <Avatar src="jane.png" name="Jane Doe" />
        <Avatar />
      </>,
    );

    expect(screen.getByRole('img', { name: 'Jane Doe' })).toHaveAttribute('src', 'jane.png');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('labels the upload control, hides its decorative icon, and selects files', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<AvatarUpload onChange={onChange} />);
    const button = screen.getByRole('button', { name: 'Upload avatar' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    const inputClick = vi.spyOn(input, 'click');
    await user.click(button);
    expect(inputClick).toHaveBeenCalledOnce();

    fireEvent.change(input, { target: { files: [file] } });
    expect(onChange).toHaveBeenCalledWith(file);
  });

  it('retains useful alt text for the upload preview', () => {
    render(<AvatarUpload src="preview.png" onChange={() => {}} />);

    expect(screen.getByRole('img', { name: 'Avatar Preview' })).toHaveAttribute('src', 'preview.png');
  });
});
