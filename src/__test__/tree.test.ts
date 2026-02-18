import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter, TreeItemCollapsibleState, commands, window } from 'vscode';
import InfracostProjectProvider, { InfracostTreeItem } from '../tree';

beforeEach(() => {
  vi.mocked(commands.executeCommand).mockResolvedValue(undefined);
});

describe('InfracostProjectProvider', () => {
  describe('getTreeItem', () => {
    it('should return the element itself', () => {
      const workspace = createMockWorkspace();
      const emitter = new EventEmitter<any>();
      const provider = new InfracostProjectProvider(workspace as any, emitter);

      const item = new InfracostTreeItem(
        'key',
        'label',
        '$10.00',
        TreeItemCollapsibleState.None,
        'block'
      );

      expect(provider.getTreeItem(item)).toBe(item);
    });
  });

  describe('getChildren - root level', () => {
    it('should call workspace.init on first call (hard refresh)', async () => {
      const workspace = createMockWorkspace();
      const emitter = new EventEmitter<any>();
      const provider = new InfracostProjectProvider(workspace as any, emitter);

      await provider.getChildren();

      expect(workspace.init).toHaveBeenCalled();
    });

    it('should return project items', async () => {
      const workspace = createMockWorkspace({
        '/path/to/project': {
          name: 'my-project',
          path: '/path/to/project',
          cost: () => '$100.00',
        },
      });
      const emitter = new EventEmitter<any>();
      const provider = new InfracostProjectProvider(workspace as any, emitter);

      const items = await provider.getChildren();

      expect(items).toHaveLength(1);
      expect(items[0].label).toBe('my-project');
      expect(items[0].type).toBe('project');
    });

    it('should show info message when workspace is null', async () => {
      const emitter = new EventEmitter<any>();
      const provider = new InfracostProjectProvider(null as any, emitter);
      (provider as any).hardRefresh = false;

      const items = await provider.getChildren();

      expect(window.showInformationMessage).toHaveBeenCalledWith('Empty workspace');
      expect(items).toEqual([]);
    });
  });

  describe('getChildren - project level (files)', () => {
    it('should return file items sorted by cost descending', async () => {
      const workspace = createMockWorkspace({
        '/project': {
          name: 'proj',
          path: '/project',
          cost: () => '$150.00',
          files: {
            '/project/main.tf': {
              name: '/project/main.tf',
              rawCost: () => 50,
              cost: () => '$50.00',
            },
            '/project/vars.tf': {
              name: '/project/vars.tf',
              rawCost: () => 100,
              cost: () => '$100.00',
            },
          },
        },
      });
      const emitter = new EventEmitter<any>();
      const provider = new InfracostProjectProvider(workspace as any, emitter);
      (provider as any).hardRefresh = false;

      const element = new InfracostTreeItem(
        '/project',
        'proj',
        '$150.00',
        TreeItemCollapsibleState.Collapsed,
        'project'
      );

      const items = await provider.getChildren(element);

      expect(items).toHaveLength(2);
      expect(items[0].label).toBe('vars.tf');
      expect(items[1].label).toBe('main.tf');
    });

    it('should handle file path resolution on win32', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      try {
        const resolvedPath = require('path').resolve('C:\\project', 'main.tf');
        const workspace = createMockWorkspace({
          'C:\\project': {
            name: 'proj',
            path: 'C:\\project',
            cost: () => '$50.00',
            files: {
              [resolvedPath]: {
                name: resolvedPath,
                rawCost: () => 50,
                cost: () => '$50.00',
              },
            },
          },
        });
        const emitter = new EventEmitter<any>();
        const provider = new InfracostProjectProvider(workspace as any, emitter);
        (provider as any).hardRefresh = false;

        const element = new InfracostTreeItem(
          'C:\\project',
          'proj',
          '$50.00',
          TreeItemCollapsibleState.Collapsed,
          'project'
        );

        const items = await provider.getChildren(element);

        expect(items).toHaveLength(1);
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });
  });

  describe('getChildren - file level (blocks)', () => {
    it('should return block items with jump-to-definition commands', async () => {
      const block = {
        name: 'aws_instance.main',
        filename: '/project/main.tf',
        rawCost: () => 42,
        cost: () => '$42.00',
        key: () => '/project/main.tf|aws_instance.main',
      };
      const workspace = createMockWorkspace({
        '/project': {
          name: 'proj',
          path: '/project',
          blocks: {
            'aws_instance.main': block,
          },
        },
      });

      const symbols = [
        {
          name: 'resource "aws_instance" "main"',
          location: {
            uri: { fsPath: '/project/main.tf' },
            range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
          },
        },
      ];
      vi.mocked(commands.executeCommand).mockResolvedValue(symbols as any);

      const emitter = new EventEmitter<any>();
      const provider = new InfracostProjectProvider(workspace as any, emitter);
      (provider as any).hardRefresh = false;

      const element = new InfracostTreeItem(
        '/project|/project/main.tf',
        'main.tf',
        '$42.00',
        TreeItemCollapsibleState.Collapsed,
        'file'
      );

      const items = await provider.getChildren(element);

      expect(items).toHaveLength(1);
      expect(items[0].label).toBe('aws_instance.main');
      expect(items[0].type).toBe('block');
      expect(items[0].command).toBeDefined();
      expect(items[0].command!.command).toBe('vscode.open');
    });

    it('should match symbols with non-matching entries before the match', async () => {
      const block = {
        name: 'aws_instance.main',
        filename: '/project/main.tf',
        rawCost: () => 42,
        cost: () => '$42.00',
        key: () => '/project/main.tf|aws_instance.main',
      };
      const workspace = createMockWorkspace({
        '/project': {
          name: 'proj',
          path: '/project',
          blocks: { 'aws_instance.main': block },
        },
      });

      const symbols = [
        {
          name: 'resource "aws_s3_bucket" "logs"',
          location: {
            uri: { fsPath: '/project/main.tf' },
            range: { start: { line: 0, character: 0 }, end: { line: 5, character: 0 } },
          },
        },
        {
          name: 'resource "aws_instance" "main"',
          location: {
            uri: { fsPath: '/project/main.tf' },
            range: { start: { line: 6, character: 0 }, end: { line: 10, character: 0 } },
          },
        },
      ];
      vi.mocked(commands.executeCommand).mockResolvedValue(symbols as any);

      const emitter = new EventEmitter<any>();
      const provider = new InfracostProjectProvider(workspace as any, emitter);
      (provider as any).hardRefresh = false;

      const element = new InfracostTreeItem(
        '/project|/project/main.tf',
        'main.tf',
        '$42.00',
        TreeItemCollapsibleState.Collapsed,
        'file'
      );

      const items = await provider.getChildren(element);

      expect(items).toHaveLength(1);
      expect(items[0].command).toBeDefined();
    });

    it('should filter out files whose resolved path does not match', async () => {
      const workspace = createMockWorkspace({
        '/project': {
          name: 'proj',
          path: '/project',
          cost: () => '$50.00',
          files: {
            'subdir/main.tf': {
              name: 'subdir/main.tf',
              rawCost: () => 50,
              cost: () => '$50.00',
            },
          },
        },
      });
      const emitter = new EventEmitter<any>();
      const provider = new InfracostProjectProvider(workspace as any, emitter);
      (provider as any).hardRefresh = false;

      const element = new InfracostTreeItem(
        '/project',
        'proj',
        '$50.00',
        TreeItemCollapsibleState.Collapsed,
        'project'
      );

      const items = await provider.getChildren(element);

      expect(items).toHaveLength(0);
    });

    it('should sort blocks by cost descending', async () => {
      const blockA = {
        name: 'aws_instance.a',
        filename: '/project/main.tf',
        rawCost: () => 10,
        cost: () => '$10.00',
        key: () => '/project/main.tf|aws_instance.a',
      };
      const blockB = {
        name: 'aws_instance.b',
        filename: '/project/main.tf',
        rawCost: () => 50,
        cost: () => '$50.00',
        key: () => '/project/main.tf|aws_instance.b',
      };
      const workspace = createMockWorkspace({
        '/project': {
          name: 'proj',
          path: '/project',
          blocks: {
            'aws_instance.a': blockA,
            'aws_instance.b': blockB,
          },
        },
      });

      vi.mocked(commands.executeCommand).mockResolvedValue(undefined);

      const emitter = new EventEmitter<any>();
      const provider = new InfracostProjectProvider(workspace as any, emitter);
      (provider as any).hardRefresh = false;

      const element = new InfracostTreeItem(
        '/project|/project/main.tf',
        'main.tf',
        '$60.00',
        TreeItemCollapsibleState.Collapsed,
        'file'
      );

      const items = await provider.getChildren(element);

      expect(items).toHaveLength(2);
      // Sorted by cost descending: b ($50) before a ($10)
      expect(items[0].label).toBe('aws_instance.b');
      expect(items[1].label).toBe('aws_instance.a');
    });

    it('should handle blocks without matching symbols', async () => {
      const block = {
        name: 'aws_instance.main',
        filename: '/project/main.tf',
        rawCost: () => 10,
        cost: () => '$10.00',
        key: () => '/project/main.tf|aws_instance.main',
      };
      const workspace = createMockWorkspace({
        '/project': {
          name: 'proj',
          path: '/project',
          blocks: { 'aws_instance.main': block },
        },
      });

      vi.mocked(commands.executeCommand).mockResolvedValue([] as any);

      const emitter = new EventEmitter<any>();
      const provider = new InfracostProjectProvider(workspace as any, emitter);
      (provider as any).hardRefresh = false;

      const element = new InfracostTreeItem(
        '/project|/project/main.tf',
        'main.tf',
        '$10.00',
        TreeItemCollapsibleState.Collapsed,
        'file'
      );

      const items = await provider.getChildren(element);

      expect(items).toHaveLength(1);
      expect(items[0].command).toBeUndefined();
    });

    it('should handle undefined symbols', async () => {
      const block = {
        name: 'aws_instance.main',
        filename: '/project/main.tf',
        rawCost: () => 10,
        cost: () => '$10.00',
        key: () => '/project/main.tf|aws_instance.main',
      };
      const workspace = createMockWorkspace({
        '/project': {
          name: 'proj',
          path: '/project',
          blocks: { 'aws_instance.main': block },
        },
      });

      vi.mocked(commands.executeCommand).mockResolvedValue(undefined);

      const emitter = new EventEmitter<any>();
      const provider = new InfracostProjectProvider(workspace as any, emitter);
      (provider as any).hardRefresh = false;

      const element = new InfracostTreeItem(
        '/project|/project/main.tf',
        'main.tf',
        '$10.00',
        TreeItemCollapsibleState.Collapsed,
        'file'
      );

      const items = await provider.getChildren(element);

      expect(items).toHaveLength(1);
      expect(items[0].command).toBeUndefined();
    });

    it('should skip blocks from different files', async () => {
      const block = {
        name: 'aws_instance.main',
        filename: '/project/other.tf',
        rawCost: () => 10,
        cost: () => '$10.00',
        key: () => '/project/other.tf|aws_instance.main',
      };
      const workspace = createMockWorkspace({
        '/project': {
          name: 'proj',
          path: '/project',
          blocks: { 'aws_instance.main': block },
        },
      });

      vi.mocked(commands.executeCommand).mockResolvedValue(undefined);

      const emitter = new EventEmitter<any>();
      const provider = new InfracostProjectProvider(workspace as any, emitter);
      (provider as any).hardRefresh = false;

      const element = new InfracostTreeItem(
        '/project|/project/main.tf',
        'main.tf',
        '$10.00',
        TreeItemCollapsibleState.Collapsed,
        'file'
      );

      const items = await provider.getChildren(element);

      expect(items).toHaveLength(0);
    });
  });

  describe('refresh', () => {
    it('should set hardRefresh to true and fire event', async () => {
      const workspace = createMockWorkspace();
      const emitter = new EventEmitter<any>();
      const fireSpy = vi.spyOn(emitter, 'fire');
      const provider = new InfracostProjectProvider(workspace as any, emitter);

      await provider.refresh();

      expect(fireSpy).toHaveBeenCalled();
    });
  });
});

describe('InfracostTreeItem', () => {
  it('should set properties correctly', () => {
    const item = new InfracostTreeItem(
      'key1',
      'My Resource',
      '$10.00',
      TreeItemCollapsibleState.None,
      'block',
      'cash.svg'
    );

    expect(item.key).toBe('key1');
    expect(item.label).toBe('My Resource');
    expect(item.description).toBe('$10.00');
    expect(item.tooltip).toBe('My Resource');
    expect(item.contextValue).toBe('block');
    expect(item.collapsibleState).toBe(TreeItemCollapsibleState.None);
  });

  it('should set icon paths when icon is provided', () => {
    const item = new InfracostTreeItem(
      'key',
      'label',
      '$0.00',
      TreeItemCollapsibleState.None,
      'project',
      'cloud.svg'
    );

    expect(item.iconPath).toBeDefined();
    expect((item.iconPath as any).light).toContain('resources/light/cloud.svg');
    expect((item.iconPath as any).dark).toContain('resources/dark/cloud.svg');
  });

  it('should not set icon paths when no icon provided', () => {
    const item = new InfracostTreeItem(
      'key',
      'label',
      '$0.00',
      TreeItemCollapsibleState.None,
      'block'
    );

    expect(item.iconPath).toBeUndefined();
  });

  it('should accept optional command', () => {
    const cmd = { title: 'Go', command: 'vscode.open', arguments: [] };
    const item = new InfracostTreeItem(
      'key',
      'label',
      '$0.00',
      TreeItemCollapsibleState.None,
      'block',
      undefined,
      cmd
    );

    expect(item.command).toBe(cmd);
  });
});

function createMockWorkspace(projects: any = {}) {
  return {
    projects,
    init: vi.fn(),
  };
}
