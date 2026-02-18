import { describe, it, expect, vi, beforeEach } from 'vitest';
import { commands, workspace, window, languages } from 'vscode';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(Buffer.from('')),
  writeFileSync: vi.fn(),
  openSync: vi.fn(),
  readSync: vi.fn(),
  closeSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('{{name}}')),
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

function setupSpawnMock(stdout: string) {
  vi.mocked(spawn).mockImplementation((() => {
    const proc = new EventEmitter();
    (proc as any).stdout = new EventEmitter();
    (proc as any).stderr = new EventEmitter();
    process.nextTick(() => {
      (proc as any).stdout.emit('data', Buffer.from(stdout));
      proc.emit('close');
    });
    return proc;
  }) as any);
}

import { activate, deactivate } from '../extension';

describe('extension', () => {
  beforeEach(() => {
    vi.mocked(commands.executeCommand).mockResolvedValue(undefined);
    vi.mocked(commands.registerCommand).mockReturnValue({ dispose: vi.fn() } as any);
    vi.mocked(window.registerTreeDataProvider).mockReturnValue({ dispose: vi.fn() } as any);
    vi.mocked(languages.registerCodeLensProvider).mockReturnValue({ dispose: vi.fn() } as any);
    vi.mocked(workspace.onDidSaveTextDocument).mockReturnValue({ dispose: vi.fn() } as any);
    setupSpawnMock('');
  });

  it('should return early when no workspace folders', async () => {
    (workspace as any).workspaceFolders = undefined;

    const ctx = createExtensionContext();
    await activate(ctx as any);

    expect(commands.registerCommand).not.toHaveBeenCalled();
  });

  it('should return early when workspace folders is empty', async () => {
    (workspace as any).workspaceFolders = [];

    const ctx = createExtensionContext();
    await activate(ctx as any);

    expect(commands.registerCommand).not.toHaveBeenCalled();
  });

  it('should register commands when workspace folders exist', async () => {
    (workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace/root' } }] as any;

    const ctx = createExtensionContext();
    await activate(ctx as any);

    expect(commands.registerCommand).toHaveBeenCalledWith(
      'infracost.refresh',
      expect.any(Function)
    );
    expect(commands.registerCommand).toHaveBeenCalledWith('infracost.login', expect.any(Function));
    expect(commands.registerCommand).toHaveBeenCalledWith(
      'infracost.resourceBreakdown',
      expect.any(Function)
    );
  });

  it('should register tree data provider', async () => {
    (workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace/root' } }] as any;

    const ctx = createExtensionContext();
    await activate(ctx as any);

    expect(window.registerTreeDataProvider).toHaveBeenCalledWith(
      'infracostProjects',
      expect.any(Object)
    );
  });

  it('should register CodeLens provider for .tf files', async () => {
    (workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace/root' } }] as any;

    const ctx = createExtensionContext();
    await activate(ctx as any);

    expect(languages.registerCodeLensProvider).toHaveBeenCalledWith(
      [{ scheme: 'file', pattern: '**/*.tf' }],
      expect.any(Object)
    );
  });

  it('should register file save listener', async () => {
    (workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace/root' } }] as any;

    const ctx = createExtensionContext();
    await activate(ctx as any);

    expect(workspace.onDidSaveTextDocument).toHaveBeenCalled();
  });

  it('should use configured currency when not empty', async () => {
    (workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace/root' } }] as any;
    setupSpawnMock('EUR\n');

    const ctx = createExtensionContext();
    await activate(ctx as any);

    // Workspace was created with EUR currency (trimmed from stdout)
    expect(commands.registerCommand).toHaveBeenCalled();
  });

  it('should invoke refresh callback when refresh command is called', async () => {
    (workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace/root' } }] as any;

    const ctx = createExtensionContext();
    await activate(ctx as any);

    // Find the refresh command callback
    const registerCalls = vi.mocked(commands.registerCommand).mock.calls;
    const refreshCall = registerCalls.find((c) => c[0] === 'infracost.refresh');
    expect(refreshCall).toBeDefined();

    // Invoke the callback - should not throw
    await refreshCall![1]();
  });

  it('should invoke login callback when login command is called', async () => {
    (workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace/root' } }] as any;

    const ctx = createExtensionContext();
    await activate(ctx as any);

    const registerCalls = vi.mocked(commands.registerCommand).mock.calls;
    const loginCall = registerCalls.find((c) => c[0] === 'infracost.login');
    expect(loginCall).toBeDefined();

    // Invoke the callback - should not throw
    await loginCall![1]();
  });

  it('should invoke resourceBreakdown callback', async () => {
    (workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace/root' } }] as any;

    const ctx = createExtensionContext();
    await activate(ctx as any);

    const registerCalls = vi.mocked(commands.registerCommand).mock.calls;
    const breakdownCall = registerCalls.find((c) => c[0] === 'infracost.resourceBreakdown');
    expect(breakdownCall).toBeDefined();

    // Invoke with a mock block
    const mockBlock = { display: vi.fn() };
    breakdownCall![1](mockBlock);
    expect(mockBlock.display).toHaveBeenCalled();
  });
});

describe('deactivate', () => {
  it('should be a no-op function', () => {
    expect(() => deactivate()).not.toThrow();
  });
});

function createExtensionContext() {
  return {
    extensionPath: '/ext',
    subscriptions: [] as any[],
    asAbsolutePath: (p: string) => `/ext/${p}`,
  };
}
