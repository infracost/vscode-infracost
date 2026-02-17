import { describe, it, expect, vi, beforeEach } from 'vitest';
import { window } from 'vscode';
import Block from '../block';
import webviews from '../webview';

describe('Block', () => {
  beforeEach(() => {
    webviews.init();
  });

  describe('constructor', () => {
    it('should set properties correctly', () => {
      const template = vi.fn();
      const block = new Block('aws_instance.main', 5, '/path/main.tf', 'USD', template as any);

      expect(block.name).toBe('aws_instance.main');
      expect(block.startLine).toBe(5);
      expect(block.filename).toBe('/path/main.tf');
      expect(block.currency).toBe('USD');
      expect(block.resources).toEqual([]);
    });

    it('should set lensPosition based on startLine', () => {
      const block = new Block('test', 10, '/file.tf', 'USD', vi.fn() as any);

      expect(block.lensPosition.start.line).toBe(9);
      expect(block.lensPosition.start.character).toBe(0);
    });

    it('should reuse existing webview panel if available', () => {
      const mockPanel = {
        webview: { html: '' },
        reveal: vi.fn(),
        onDidDispose: vi.fn(),
      };
      webviews.add('/file.tf|test', mockPanel as any);

      const block = new Block('test', 1, '/file.tf', 'USD', vi.fn() as any);

      expect(block.webview).toBe(mockPanel);
    });

    it('should register onDispose callback when existing webview found', () => {
      const disposeCallbacks: (() => void)[] = [];
      const mockPanel = {
        webview: { html: '' },
        reveal: vi.fn(),
        onDidDispose: vi.fn((cb: () => void) => {
          disposeCallbacks.push(cb);
          return { dispose: vi.fn() };
        }),
      };
      webviews.add('/file.tf|test', mockPanel as any);

      const block = new Block('test', 1, '/file.tf', 'USD', vi.fn() as any);

      // Trigger the onDispose callback from webviews.onDispose
      disposeCallbacks[disposeCallbacks.length - 1]();

      expect(block.webview).toBeUndefined();
    });
  });

  describe('key', () => {
    it('should return filename|name format', () => {
      const block = new Block('aws_instance.main', 1, '/path/main.tf', 'USD', vi.fn() as any);

      expect(block.key()).toBe('/path/main.tf|aws_instance.main');
    });
  });

  describe('rawCost', () => {
    it('should return 0 for no resources', () => {
      const block = new Block('test', 1, '/file.tf', 'USD', vi.fn() as any);

      expect(block.rawCost()).toBe(0);
    });

    it('should sum monthly costs of all resources', () => {
      const block = new Block('test', 1, '/file.tf', 'USD', vi.fn() as any);
      block.resources = [{ monthlyCost: 10.5 } as any, { monthlyCost: 20.3 } as any];

      expect(block.rawCost()).toBeCloseTo(30.8);
    });

    it('should treat null monthlyCost as 0', () => {
      const block = new Block('test', 1, '/file.tf', 'USD', vi.fn() as any);
      block.resources = [{ monthlyCost: null } as any, { monthlyCost: 15 } as any];

      expect(block.rawCost()).toBe(15);
    });
  });

  describe('cost', () => {
    it('should format cost as USD currency', () => {
      const block = new Block('test', 1, '/file.tf', 'USD', vi.fn() as any);
      block.resources = [{ monthlyCost: 42.5 } as any];

      expect(block.cost()).toBe('$42.50');
    });

    it('should format zero cost', () => {
      const block = new Block('test', 1, '/file.tf', 'USD', vi.fn() as any);

      expect(block.cost()).toBe('$0.00');
    });

    it('should format with different currency', () => {
      const block = new Block('test', 1, '/file.tf', 'EUR', vi.fn() as any);
      block.resources = [{ monthlyCost: 100 } as any];

      const cost = block.cost();
      expect(cost).toContain('100');
    });
  });

  describe('display', () => {
    it('should reveal existing webview and update html', () => {
      const template = vi.fn().mockReturnValue('<html>cost</html>');
      const mockPanel = {
        webview: { html: '' },
        reveal: vi.fn(),
        onDidDispose: vi.fn(),
      };
      webviews.add('/file.tf|test', mockPanel as any);

      const block = new Block('test', 1, '/file.tf', 'USD', template as any);
      block.display();

      expect(template).toHaveBeenCalledWith(block);
      expect(mockPanel.webview.html).toBe('<html>cost</html>');
      expect(mockPanel.reveal).toHaveBeenCalled();
    });

    it('should create new webview panel when none exists', () => {
      const template = vi.fn().mockReturnValue('<html>new</html>');
      const mockPanel = {
        webview: { html: '' },
        reveal: vi.fn(),
        onDidDispose: vi.fn(),
      };
      vi.mocked(window.createWebviewPanel).mockReturnValue(mockPanel as any);

      const block = new Block('test', 1, '/file.tf', 'USD', template as any);
      block.display();

      expect(window.createWebviewPanel).toHaveBeenCalledWith(
        'test/file.tf',
        'test',
        { viewColumn: 2, preserveFocus: false },
        {
          retainContextWhenHidden: true,
          enableFindWidget: true,
          enableCommandUris: true,
          enableScripts: true,
        }
      );
      expect(mockPanel.webview.html).toBe('<html>new</html>');
      expect(mockPanel.reveal).toHaveBeenCalled();
    });

    it('should register dispose handler for new webview', () => {
      const template = vi.fn().mockReturnValue('<html></html>');
      const disposeCallbacks: (() => void)[] = [];
      const mockPanel = {
        webview: { html: '' },
        reveal: vi.fn(),
        onDidDispose: vi.fn((cb: () => void) => {
          disposeCallbacks.push(cb);
          return { dispose: vi.fn() };
        }),
      };
      vi.mocked(window.createWebviewPanel).mockReturnValue(mockPanel as any);

      const block = new Block('test', 1, '/file.tf', 'USD', template as any);
      block.display();

      expect(block.webview).toBe(mockPanel);

      // Trigger the dispose callback registered via webviews.add
      disposeCallbacks[0]();

      expect(block.webview).toBeUndefined();
    });
  });
});
