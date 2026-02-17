import { describe, it, expect, vi, beforeEach } from 'vitest';
import { commands } from 'vscode';
import InfracostLensProvider from '../lens';
import context from '../context';

beforeEach(() => {
  vi.mocked(commands.executeCommand).mockResolvedValue(undefined);
});

describe('InfracostLensProvider', () => {
  it('should return empty array if not logged in', async () => {
    await context.set('loggedIn', false);
    const workspace = createMockWorkspace();
    const provider = new InfracostLensProvider(workspace as any);
    const doc = { uri: { fsPath: '/path/main.tf', path: '/path/main.tf' } };

    const lenses = await provider.provideCodeLenses(doc as any);

    expect(lenses).toEqual([]);
  });

  it('should return code lenses for blocks when logged in', async () => {
    await context.set('loggedIn', true);

    const block = {
      filename: '/path/main.tf',
      cost: vi.fn().mockReturnValue('$42.50'),
      lensPosition: { start: { line: 5, character: 0 }, end: { line: 5, character: 0 } },
    };
    const workspace = createMockWorkspace({ 'aws_instance.main': block });
    const provider = new InfracostLensProvider(workspace as any);
    const doc = { uri: { fsPath: '/path/main.tf', path: '/path/main.tf' } };

    const lenses = await provider.provideCodeLenses(doc as any);

    expect(lenses).toHaveLength(1);
    expect(lenses[0]!.command!.title).toBe('Total monthly cost: $42.50');
    expect(lenses[0]!.command!.command).toBe('infracost.resourceBreakdown');
  });

  it('should show loading message when workspace is loading', async () => {
    await context.set('loggedIn', true);

    const block = {
      filename: '/path/main.tf',
      cost: vi.fn().mockReturnValue('$0.00'),
      lensPosition: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    };
    const workspace = createMockWorkspace({ test: block }, true);
    const provider = new InfracostLensProvider(workspace as any);
    const doc = { uri: { fsPath: '/path/main.tf', path: '/path/main.tf' } };

    const lenses = await provider.provideCodeLenses(doc as any);

    expect(lenses[0]!.command!.title).toBe('loading...');
  });

  it('should skip blocks from different files', async () => {
    await context.set('loggedIn', true);

    const block = {
      filename: '/path/other.tf',
      cost: vi.fn().mockReturnValue('$10.00'),
      lensPosition: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    };
    const workspace = createMockWorkspace({ test: block });
    const provider = new InfracostLensProvider(workspace as any);
    const doc = { uri: { fsPath: '/path/main.tf', path: '/path/main.tf' } };

    const lenses = await provider.provideCodeLenses(doc as any);

    expect(lenses).toHaveLength(0);
  });

  it('should match filenames case-insensitively', async () => {
    await context.set('loggedIn', true);

    const block = {
      filename: '/Path/Main.tf',
      cost: vi.fn().mockReturnValue('$5.00'),
      lensPosition: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    };
    const workspace = createMockWorkspace({ test: block });
    const provider = new InfracostLensProvider(workspace as any);
    const doc = { uri: { fsPath: '/path/main.tf', path: '/path/main.tf' } };

    const lenses = await provider.provideCodeLenses(doc as any);

    expect(lenses).toHaveLength(1);
  });

  it('should wire onDidChangeCodeLenses to workspace event', () => {
    const workspace = createMockWorkspace();
    const provider = new InfracostLensProvider(workspace as any);

    expect(provider.onDidChangeCodeLenses).toBe(workspace.codeLensEventEmitter.event);
  });
});

function createMockWorkspace(blocks: any = {}, loading = false) {
  return {
    loading,
    codeLensEventEmitter: {
      event: vi.fn(),
    },
    project: vi.fn().mockReturnValue(blocks),
  };
}
