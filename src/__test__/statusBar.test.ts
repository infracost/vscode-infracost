import { describe, it, expect, vi, beforeEach } from 'vitest';
import { window, commands, MarkdownString, ThemeColor } from 'vscode';
import infracostStatus from '../statusBar';
import context, { ERROR } from '../context';

// The statusBar singleton calls window.createStatusBarItem at import time.
// Capture the mock item from the mock's recorded results.
const mockItem = vi.mocked(window.createStatusBarItem).mock.results[0].value;

beforeEach(() => {
  vi.mocked(commands.executeCommand).mockResolvedValue(undefined);
});

describe('StatusBar', () => {
  it('should set loading state with spinning icon', () => {
    infracostStatus.setLoading();

    expect(mockItem.text).toBe('$(sync~spin) Infracost');
    expect(mockItem.backgroundColor).toBeUndefined();
    expect(mockItem.tooltip).toBeUndefined();
    expect(mockItem.show).toHaveBeenCalled();
  });

  it('should set ready state with cloud icon when no error', async () => {
    await context.set(ERROR, undefined);

    infracostStatus.setReady();

    expect(mockItem.text).toBe('$(cloud) Infracost');
    expect(mockItem.tooltip).toBeUndefined();
    expect(mockItem.show).toHaveBeenCalled();
  });

  it('should set error state when context has error', async () => {
    await context.set(ERROR, 'Something went wrong');

    infracostStatus.setReady();

    expect(mockItem.text).toBe('$(error) Infracost');
    expect(mockItem.backgroundColor).toBeInstanceOf(ThemeColor);
    expect(mockItem.tooltip).toBeInstanceOf(MarkdownString);
    expect(mockItem.show).toHaveBeenCalled();

    await context.set(ERROR, undefined);
  });

  it('should set error state directly', () => {
    infracostStatus.setError('Custom error message');

    expect(mockItem.text).toBe('$(error) Infracost');
    expect(mockItem.backgroundColor).toBeInstanceOf(ThemeColor);
    expect(mockItem.tooltip).toBeInstanceOf(MarkdownString);
    expect((mockItem.tooltip as MarkdownString).value).toBe('Custom error message');
    expect(mockItem.show).toHaveBeenCalled();
  });

  it('should subscribe to extension context for disposal', () => {
    const ctx = {
      subscriptions: [] as any[],
    };

    infracostStatus.subscribeContext(ctx as any);

    expect(ctx.subscriptions).toContain(mockItem);
  });
});
