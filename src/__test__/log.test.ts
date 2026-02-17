import { describe, it, expect, vi } from 'vitest';
import { window } from 'vscode';
import logger from '../log';

// The logger singleton calls window.createOutputChannel at import time.
// Capture the mock channel from the mock's recorded results.
const mockChannel = vi.mocked(window.createOutputChannel).mock.results[0].value;

describe('Logger', () => {
  it('should create an output channel named "Infracost Debug"', () => {
    expect(window.createOutputChannel).toHaveBeenCalledWith('Infracost Debug');
  });

  it('should log debug messages with debug prefix', () => {
    logger.debug('test message');

    expect(mockChannel.appendLine).toHaveBeenCalledWith('debug: test message');
  });

  it('should log error messages with error prefix', () => {
    logger.error('error message');

    expect(mockChannel.appendLine).toHaveBeenCalledWith('error: error message');
  });
});
