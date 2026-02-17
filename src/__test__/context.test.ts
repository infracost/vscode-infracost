import { describe, it, expect, vi, beforeEach } from 'vitest';
import { commands } from 'vscode';
import context, { LOGGED_IN, ERROR, ACTIVE } from '../context';

beforeEach(() => {
  vi.mocked(commands.executeCommand).mockResolvedValue(undefined);
});

describe('Context', () => {
  it('should export correct constants', () => {
    expect(LOGGED_IN).toBe('loggedIn');
    expect(ERROR).toBe('error');
    expect(ACTIVE).toBe('active');
  });

  it('should initialize and set active to true', async () => {
    const cli = { exec: vi.fn().mockResolvedValue({ stdout: '', stderr: 'No API key' }) };

    await context.init(cli as any);

    expect(commands.executeCommand).toHaveBeenCalledWith('setContext', 'infracost:active', true);
  });

  it('should set loggedIn when API key exists', async () => {
    const cli = { exec: vi.fn().mockResolvedValue({ stdout: 'abc123', stderr: '' }) };

    await context.init(cli as any);

    expect(context.isLoggedIn()).toBe(true);
    expect(commands.executeCommand).toHaveBeenCalledWith('setContext', 'infracost:loggedIn', true);
  });

  it('should not set loggedIn when no API key', async () => {
    const cli = { exec: vi.fn().mockResolvedValue({ stdout: '', stderr: 'No API key found' }) };

    await context.init(cli as any);

    expect(context.isLoggedIn()).toBe(false);
  });

  it('should set and get values', async () => {
    await context.set('testKey', 'testValue');

    expect(context.get('testKey')).toBe('testValue');
    expect(commands.executeCommand).toHaveBeenCalledWith(
      'setContext',
      'infracost:testKey',
      'testValue'
    );
  });

  it('should return undefined for unknown keys', async () => {
    // Clear data first
    const cli = { exec: vi.fn().mockResolvedValue({ stdout: '', stderr: 'No API key' }) };
    await context.init(cli as any);

    expect(context.get('nonexistent')).toBeUndefined();
  });

  it('should clear data on re-init', async () => {
    await context.set('someKey', 'someValue');
    const cli = { exec: vi.fn().mockResolvedValue({ stdout: '', stderr: 'No API key' }) };

    await context.init(cli as any);

    expect(context.get('someKey')).toBeUndefined();
  });
});
