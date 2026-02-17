import { describe, it, expect, vi, beforeEach } from 'vitest';
import { commands } from 'vscode';
import {
  cleanFilename,
  isValidTerraformFile,
  getFileEncoding,
  CONFIG_FILE_NAME,
  CONFIG_TEMPLATE_NAME,
  USAGE_FILE_NAME,
} from '../utils';

vi.mock('fs', () => ({
  openSync: vi.fn().mockReturnValue(1),
  readSync: vi.fn(),
  closeSync: vi.fn(),
}));

describe('cleanFilename', () => {
  it('should lowercase Windows drive letters at start', () => {
    expect(cleanFilename('/C:/Users/test/file.tf')).toBe('/c:/Users/test/file.tf');
  });

  it('should not modify Unix-style paths', () => {
    expect(cleanFilename('/home/user/file.tf')).toBe('/home/user/file.tf');
  });

  it('should convert backslashes to forward slashes for Windows paths', () => {
    expect(cleanFilename('c:\\Users\\test\\file.tf')).toBe('/c:/Users/test/file.tf');
  });

  it('should handle double backslashes', () => {
    expect(cleanFilename('c:\\\\Users\\\\test\\\\file.tf')).toBe('/c:/Users/test/file.tf');
  });

  it('should handle already lowercase drive letters', () => {
    expect(cleanFilename('/d:/projects/infra')).toBe('/d:/projects/infra');
  });
});

describe('isValidTerraformFile', () => {
  beforeEach(() => {
    vi.mocked(commands.executeCommand).mockResolvedValue(undefined);
  });

  it('should return false for non-.tf files', async () => {
    const file = { uri: { path: '/path/to/file.txt' } };

    const result = await isValidTerraformFile(file as any);

    expect(result).toBe(false);
  });

  it('should return false for .tf file with no symbols', async () => {
    vi.mocked(commands.executeCommand).mockResolvedValue(undefined);
    const file = { uri: { path: '/path/to/main.tf' } };

    const result = await isValidTerraformFile(file as any);

    expect(result).toBe(false);
  });

  it('should return true for .tf file with symbols', async () => {
    vi.mocked(commands.executeCommand).mockResolvedValue([{ name: 'resource' }] as any);
    const file = { uri: { path: '/path/to/main.tf' } };

    const result = await isValidTerraformFile(file as any);

    expect(result).toBe(true);
  });
});

describe('getFileEncoding', () => {
  let mockReadSync: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const fs = await import('fs');
    mockReadSync = vi.mocked(fs.readSync);
    mockReadSync.mockReset();
  });

  it('should detect UTF-8 BOM', async () => {
    mockReadSync.mockImplementation((_fd: any, buffer: any) => {
      buffer[0] = 0xef;
      buffer[1] = 0xbb;
      buffer[2] = 0xbf;
      return 5;
    });

    const result = await getFileEncoding('/path/to/file');

    expect(result).toBe('utf8');
  });

  it('should detect UTF-16 BE', async () => {
    mockReadSync.mockImplementation((_fd: any, buffer: any) => {
      buffer[0] = 0xfe;
      buffer[1] = 0xff;
      return 5;
    });

    const result = await getFileEncoding('/path/to/file');

    expect(result).toBe('utf16be');
  });

  it('should detect UTF-16 LE', async () => {
    mockReadSync.mockImplementation((_fd: any, buffer: any) => {
      buffer[0] = 0xff;
      buffer[1] = 0xfe;
      return 5;
    });

    const result = await getFileEncoding('/path/to/file');

    expect(result).toBe('utf16le');
  });

  it('should default to utf8 for no BOM', async () => {
    mockReadSync.mockImplementation((_fd: any, buffer: any) => {
      buffer[0] = 0x48;
      buffer[1] = 0x65;
      return 5;
    });

    const result = await getFileEncoding('/path/to/file');

    expect(result).toBe('utf8');
  });
});

describe('constants', () => {
  it('should export correct config file names', () => {
    expect(CONFIG_FILE_NAME).toBe('infracost.yml');
    expect(CONFIG_TEMPLATE_NAME).toBe('infracost.yml.tmpl');
    expect(USAGE_FILE_NAME).toBe('infracost-usage.yml');
  });
});
