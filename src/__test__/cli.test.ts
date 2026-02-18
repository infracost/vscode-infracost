import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('CLI', () => {
  let CLI: typeof import('../cli').default;
  let spawn: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const cp = await import('child_process');
    spawn = vi.mocked(cp.spawn);
    const mod = await import('../cli');
    CLI = mod.default;
  });

  it('should spawn the binary with correct args and env', async () => {
    const mockStdout = new EventEmitter();
    const mockStderr = new EventEmitter();
    const mockProcess = new EventEmitter();
    (mockProcess as any).stdout = mockStdout;
    (mockProcess as any).stderr = mockStderr;
    spawn.mockReturnValue(mockProcess);

    const cli = new CLI('/usr/bin/infracost');
    const promise = cli.exec(['breakdown', '--format', 'json']);

    mockStdout.emit('data', Buffer.from('{"projects":[]}'));
    mockStderr.emit('data', Buffer.from(''));
    mockProcess.emit('close');

    const result = await promise;

    expect(spawn).toHaveBeenCalledWith('/usr/bin/infracost', ['breakdown', '--format', 'json'], {
      cwd: undefined,
      env: expect.objectContaining({
        INFRACOST_CLI_PLATFORM: 'vscode',
        INFRACOST_NO_COLOR: 'true',
        INFRACOST_SKIP_UPDATE_CHECK: 'true',
        INFRACOST_GRAPH_EVALUATOR: 'true',
      }),
    });
    expect(result.stdout).toBe('{"projects":[]}');
    expect(result.stderr).toBe('');
  });

  it('should pass cwd when provided', async () => {
    const mockStdout = new EventEmitter();
    const mockStderr = new EventEmitter();
    const mockProcess = new EventEmitter();
    (mockProcess as any).stdout = mockStdout;
    (mockProcess as any).stderr = mockStderr;
    spawn.mockReturnValue(mockProcess);

    const cli = new CLI('/usr/bin/infracost');
    const promise = cli.exec(['configure', 'get', 'currency'], '/workspace');

    mockProcess.emit('close');
    await promise;

    expect(spawn).toHaveBeenCalledWith(
      '/usr/bin/infracost',
      ['configure', 'get', 'currency'],
      expect.objectContaining({ cwd: '/workspace' })
    );
  });

  it('should concatenate multiple stdout chunks', async () => {
    const mockStdout = new EventEmitter();
    const mockStderr = new EventEmitter();
    const mockProcess = new EventEmitter();
    (mockProcess as any).stdout = mockStdout;
    (mockProcess as any).stderr = mockStderr;
    spawn.mockReturnValue(mockProcess);

    const cli = new CLI('/usr/bin/infracost');
    const promise = cli.exec(['test']);

    mockStdout.emit('data', Buffer.from('chunk1'));
    mockStdout.emit('data', Buffer.from('chunk2'));
    mockProcess.emit('close');

    const result = await promise;
    expect(result.stdout).toBe('chunk1chunk2');
  });

  it('should capture stderr output', async () => {
    const mockStdout = new EventEmitter();
    const mockStderr = new EventEmitter();
    const mockProcess = new EventEmitter();
    (mockProcess as any).stdout = mockStdout;
    (mockProcess as any).stderr = mockStderr;
    spawn.mockReturnValue(mockProcess);

    const cli = new CLI('/usr/bin/infracost');
    const promise = cli.exec(['test']);

    mockStderr.emit('data', Buffer.from('error output'));
    mockProcess.emit('close');

    const result = await promise;
    expect(result.stderr).toBe('error output');
  });
});
