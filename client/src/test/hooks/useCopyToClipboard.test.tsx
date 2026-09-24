import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCopyToClipboard } from '@library';

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const execCommandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand');
const writeText = vi.fn();

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe('useCopyToClipboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: undefined });
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
    else Reflect.deleteProperty(navigator, 'clipboard');
    if (execCommandDescriptor) Object.defineProperty(document, 'execCommand', execCommandDescriptor);
    else Reflect.deleteProperty(document, 'execCommand');
  });

  it('copies empty text and resets keyed success feedback after the configured duration', async () => {
    const { result } = renderHook(() => useCopyToClipboard({ resetAfterMs: 2200 }));
    await act(async () => { expect(await result.current.copy('', 'empty')).toBe(true); });
    expect(writeText).toHaveBeenCalledWith('');
    expect(result.current.copiedKey).toBe('empty');
    act(() => { vi.advanceTimersByTime(2199); });
    expect(result.current.copied).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.status).toBe('idle');
  });

  it('restarts the feedback timeout on a subsequent copy', async () => {
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => { await result.current.copy('first', 'first'); });
    act(() => { vi.advanceTimersByTime(1500); });
    await act(async () => { await result.current.copy('second', 'second'); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.copiedKey).toBe('second');
    act(() => { vi.advanceTimersByTime(1500); });
    expect(result.current.status).toBe('idle');
  });

  it.each(['unavailable', 'denied'])('falls back when the API is %s and restores focus and selection', async mode => {
    if (mode === 'unavailable') Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    else writeText.mockRejectedValue(new Error('Permission denied'));
    const button = document.createElement('button');
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Selected text';
    document.body.append(button, paragraph);
    button.focus();
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    const execCommand = vi.fn(() => {
      expect(document.querySelector('textarea')?.value).toBe('fallback text');
      return true;
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => { expect(await result.current.copy('fallback text')).toBe(true); });
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
    expect(button).toHaveFocus();
    expect(selection.toString()).toBe('Selected text');
    button.remove();
    paragraph.remove();
  });

  it.each(['missing', 'false', 'throws'])('reports expiring errors when the fallback is %s', async mode => {
    writeText.mockRejectedValue(new Error('Denied'));
    if (mode !== 'missing') {
      Object.defineProperty(document, 'execCommand', { configurable: true, value: () => {
        if (mode === 'throws') throw new Error('Denied');
        return false;
      } });
    }
    const { result } = renderHook(() => useCopyToClipboard());
    await act(async () => { expect(await result.current.copy('text')).toBe(false); });
    expect(result.current.error).toBe(true);
    expect(result.current.copied).toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.status).toBe('idle');
  });

  it('returns the actual copy result while keeping feedback on the newest request', async () => {
    const pending = deferred();
    writeText.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useCopyToClipboard());
    let first!: Promise<boolean>;
    act(() => { first = result.current.copy('first', 'first'); });
    await act(async () => { await result.current.copy('second', 'second'); });
    await act(async () => { pending.resolve(); expect(await first).toBe(true); });
    expect(result.current.copiedKey).toBe('second');
  });

  it('invalidates pending copies on reset and unmount', async () => {
    const pending = deferred();
    writeText.mockReturnValue(pending.promise);
    const { result, unmount } = renderHook(() => useCopyToClipboard({ storageKey: 'feedback' }));
    let copying!: Promise<boolean>;
    act(() => { copying = result.current.copy('secret'); });
    act(() => { result.current.reset(); });
    await act(async () => { pending.resolve(); await copying; });
    expect(result.current.status).toBe('idle');
    const next = deferred();
    writeText.mockReturnValue(next.promise);
    act(() => { copying = result.current.copy('another secret'); });
    unmount();
    await act(async () => { next.resolve(); await copying; });
    expect(sessionStorage.getItem('feedback')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves only feedback metadata across remounts for the remaining timeout', async () => {
    const first = renderHook(() => useCopyToClipboard({ storageKey: 'feedback' }));
    await act(async () => { await first.result.current.copy('secret invite', 'invite-url'); });
    expect(sessionStorage.getItem('feedback')).not.toContain('secret invite');
    act(() => { vi.advanceTimersByTime(1500); });
    first.unmount();
    expect(vi.getTimerCount()).toBe(0);
    const second = renderHook(() => useCopyToClipboard({ storageKey: 'feedback' }));
    expect(second.result.current.copiedKey).toBe('invite-url');
    act(() => { vi.advanceTimersByTime(500); });
    expect(second.result.current.status).toBe('idle');
    expect(sessionStorage.getItem('feedback')).toBeNull();
  });

  it('still copies when optional storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Disabled'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Disabled'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Disabled'); });
    const { result } = renderHook(() => useCopyToClipboard({ storageKey: 'feedback' }));
    await act(async () => { expect(await result.current.copy('text')).toBe(true); });
    expect(result.current.copied).toBe(true);
  });
});
