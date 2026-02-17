import { describe, it, expect, vi, beforeEach } from 'vitest';
import webviews from '../webview';

describe('Webviews', () => {
  beforeEach(() => {
    webviews.init();
  });

  it('should initialize with empty views', () => {
    expect(webviews.views).toEqual({});
  });

  it('should add a panel and track it in views', () => {
    const panel = createMockPanel();

    webviews.add('key1', panel as any);

    expect(webviews.views['key1']).toBe(panel);
  });

  it('should remove panel from views on dispose', () => {
    const panel = createMockPanel();

    webviews.add('key1', panel as any);
    expect(webviews.views['key1']).toBe(panel);

    const disposeCallback = vi.mocked(panel.onDidDispose).mock.calls[0][0];
    disposeCallback();

    expect(webviews.views['key1']).toBeUndefined();
  });

  it('should call dispose callback when panel is disposed', () => {
    const panel = createMockPanel();
    const dispose = vi.fn();

    webviews.add('key1', panel as any, dispose);

    const disposeCallback = vi.mocked(panel.onDidDispose).mock.calls[0][0];
    disposeCallback();

    expect(dispose).toHaveBeenCalled();
  });

  it('should get a panel by key', () => {
    const panel = createMockPanel();

    webviews.add('key1', panel as any);

    expect(webviews.get('key1')).toBe(panel);
  });

  it('should return undefined for unknown key', () => {
    expect(webviews.get('unknown')).toBeUndefined();
  });

  it('should clear all views on init', () => {
    const panel = createMockPanel();
    webviews.add('key1', panel as any);

    webviews.init();

    expect(webviews.views).toEqual({});
  });

  it('should register onDispose handler for existing panel', () => {
    const panel = createMockPanel();
    webviews.add('key1', panel as any);

    const disposeHandler = vi.fn();
    webviews.onDispose('key1', disposeHandler);

    expect(panel.onDidDispose).toHaveBeenCalledTimes(2);

    const callback = vi.mocked(panel.onDidDispose).mock.calls[1][0];
    callback();

    expect(disposeHandler).toHaveBeenCalled();
    expect(webviews.views['key1']).toBeUndefined();
  });

  it('should not register onDispose handler for non-existing panel', () => {
    const disposeHandler = vi.fn();

    webviews.onDispose('unknown', disposeHandler);

    expect(disposeHandler).not.toHaveBeenCalled();
  });
});

function createMockPanel() {
  return {
    webview: { html: '' },
    reveal: vi.fn(),
    dispose: vi.fn(),
    onDidDispose: vi.fn(),
  };
}
