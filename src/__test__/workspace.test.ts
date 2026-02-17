import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter, commands, window } from 'vscode';
import * as path from 'path';
import Workspace from '../workspace';
import context, { LOGGED_IN, ERROR } from '../context';
import webviews from '../webview';

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
  writeFileSync: vi.fn(),
  openSync: vi.fn(),
  readSync: vi.fn(),
  closeSync: vi.fn(),
}));

const mockCli = () => ({
  exec: vi.fn().mockResolvedValue({ stdout: '{"projects":[]}', stderr: '' }),
});

beforeEach(() => {
  vi.mocked(commands.executeCommand).mockResolvedValue(undefined);
  vi.mocked(window.showInformationMessage).mockResolvedValue(undefined as any);
  webviews.init();
});

describe('Workspace', () => {
  describe('login', () => {
    it('should set LOGGED_IN on successful login', async () => {
      const cli = mockCli();
      cli.exec.mockResolvedValueOnce({
        stdout: 'Your account has been authenticated',
        stderr: '',
      });
      // Make init succeed after login
      cli.exec.mockResolvedValue({ stdout: '{"projects":[]}', stderr: '' });
      await context.set(LOGGED_IN, true);

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');
      await ws.login();

      expect(context.isLoggedIn()).toBe(true);
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        'VS Code is now connected to Infracost'
      );
    });

    it('should set LOGGED_IN to false on failed login', async () => {
      const cli = mockCli();
      cli.exec.mockResolvedValue({ stdout: 'Login failed', stderr: '' });

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');
      await ws.login();

      expect(context.isLoggedIn()).toBe(false);
    });
  });

  describe('init', () => {
    it('should show login message when not logged in', async () => {
      await context.set(LOGGED_IN, false);
      const cli = mockCli();
      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      await ws.init();

      expect(window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Connect VSCode to Infracost Cloud')
      );
    });

    it('should run breakdown when logged in', async () => {
      const cli = mockCli();
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify({
          projects: [{ name: 'proj', metadata: { path: '/root' }, breakdown: { resources: [] } }],
        }),
        stderr: '',
      });
      await context.set(LOGGED_IN, true);

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');
      await ws.init();

      expect(cli.exec).toHaveBeenCalledWith(
        expect.arrayContaining(['breakdown', '--path', '/root'])
      );
    });

    it('should set isError on failure', async () => {
      const cli = mockCli();
      cli.exec.mockRejectedValue(new Error('failed'));
      await context.set(LOGGED_IN, true);

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');
      await ws.init();

      expect(ws.isError).toBe(true);
      expect(ws.loading).toBe(false);
    });

    it('should reset projects and filesToProjects', async () => {
      const cli = mockCli();
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify({
          projects: [{ name: 'p', metadata: { path: '/root' }, breakdown: { resources: [] } }],
        }),
        stderr: '',
      });
      await context.set(LOGGED_IN, true);

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');
      ws.projects = { old: {} as any };
      ws.filesToProjects = { old: {} as any };

      await ws.init();

      expect(ws.projects).not.toHaveProperty('old');
    });
  });

  describe('show', () => {
    it('should call display on the block', () => {
      const block = { display: vi.fn() };
      Workspace.show(block as any);
      expect(block.display).toHaveBeenCalled();
    });
  });

  describe('project', () => {
    it('should return blocks for a known file', () => {
      const cli = mockCli();
      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      const mockBlocks = { 'aws_instance.main': {} as any };
      ws.projects['/root/project'] = { blocks: mockBlocks } as any;
      ws.filesToProjects['/root/project/main.tf'] = { '/root/project': true };

      const blocks = ws.project('/root/project/main.tf');

      expect(blocks).toBe(mockBlocks);
    });

    it('should return empty object for unknown file', () => {
      const cli = mockCli();
      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      const blocks = ws.project('/unknown/file.tf');

      expect(blocks).toEqual({});
    });

    it('should match filenames case-insensitively', () => {
      const cli = mockCli();
      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      const mockBlocks = { test: {} as any };
      ws.projects['/root/proj'] = { blocks: mockBlocks } as any;
      ws.filesToProjects['/Root/Proj/Main.tf'] = { '/root/proj': true };

      const blocks = ws.project('/root/proj/main.tf');

      expect(blocks).toBe(mockBlocks);
    });
  });

  describe('fileChange', () => {
    it('should ignore non-terraform, non-config files', async () => {
      const cli = mockCli();
      await context.set(LOGGED_IN, true);

      vi.mocked(commands.executeCommand).mockResolvedValue(undefined);

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      const file = { uri: { path: '/root/readme.md' } };
      await ws.fileChange(file as any);

      expect(cli.exec).not.toHaveBeenCalled();
    });

    it('should reinit on config file change', async () => {
      const cli = mockCli();
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify({
          projects: [{ name: 'p', metadata: { path: '/root' }, breakdown: { resources: [] } }],
        }),
        stderr: '',
      });
      await context.set(LOGGED_IN, true);

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      const file = { uri: { path: path.join('/root', 'infracost.yml') } };
      await ws.fileChange(file as any);

      expect(cli.exec).toHaveBeenCalled();
    });

    it('should reinit on config template change', async () => {
      const cli = mockCli();
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify({
          projects: [{ name: 'p', metadata: { path: '/root' }, breakdown: { resources: [] } }],
        }),
        stderr: '',
      });
      await context.set(LOGGED_IN, true);

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      const file = { uri: { path: path.join('/root', 'infracost.yml.tmpl') } };
      await ws.fileChange(file as any);

      expect(cli.exec).toHaveBeenCalled();
    });

    it('should reinit on root usage file change', async () => {
      const cli = mockCli();
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify({
          projects: [{ name: 'p', metadata: { path: '/root' }, breakdown: { resources: [] } }],
        }),
        stderr: '',
      });
      await context.set(LOGGED_IN, true);

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      const file = { uri: { path: path.join('/root', 'infracost-usage.yml') } };
      await ws.fileChange(file as any);

      expect(cli.exec).toHaveBeenCalled();
    });

    it('should reinit when in error state', async () => {
      const cli = mockCli();
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify({
          projects: [{ name: 'p', metadata: { path: '/root' }, breakdown: { resources: [] } }],
        }),
        stderr: '',
      });
      await context.set(LOGGED_IN, true);

      vi.mocked(commands.executeCommand).mockImplementation(async (cmd: string) => {
        if (cmd === 'vscode.executeDocumentSymbolProvider') {
          return [{ name: 'resource' }];
        }
        return undefined;
      });

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');
      ws.isError = true;

      const file = { uri: { path: '/root/main.tf' } };
      await ws.fileChange(file as any);

      expect(cli.exec).toHaveBeenCalled();
    });

    it('should run only affected projects on file change', async () => {
      const cli = mockCli();
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify({
          projects: [
            { name: 'p', metadata: { path: '/root/project' }, breakdown: { resources: [] } },
          ],
        }),
        stderr: '',
      });
      await context.set(LOGGED_IN, true);

      vi.mocked(commands.executeCommand).mockImplementation(async (cmd: string) => {
        if (cmd === 'vscode.executeDocumentSymbolProvider') {
          return [{ name: 'resource' }];
        }
        return undefined;
      });

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');
      ws.filesToProjects['/root/project/main.tf'] = { '/root/project': true };

      const file = { uri: { path: '/root/project/main.tf' } };
      await ws.fileChange(file as any);

      expect(cli.exec).toHaveBeenCalledWith(
        expect.arrayContaining(['breakdown', '--path', '/root/project'])
      );
    });

    it('should attempt to find project by directory when file not in filesToProjects', async () => {
      const cli = mockCli();
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify({
          projects: [
            { name: 'p', metadata: { path: '/root/project' }, breakdown: { resources: [] } },
          ],
        }),
        stderr: '',
      });
      await context.set(LOGGED_IN, true);

      vi.mocked(commands.executeCommand).mockImplementation(async (cmd: string) => {
        if (cmd === 'vscode.executeDocumentSymbolProvider') {
          return [{ name: 'resource' }];
        }
        return undefined;
      });

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');
      ws.projects['/root/project'] = {} as any;

      const file = { uri: { path: '/root/project/new.tf' } };
      await ws.fileChange(file as any);

      expect(cli.exec).toHaveBeenCalledWith(
        expect.arrayContaining(['breakdown', '--path', '/root/project'])
      );
    });

    it('should skip projects that do not match directory', async () => {
      const cli = mockCli();
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify({
          projects: [
            { name: 'p', metadata: { path: '/root/project' }, breakdown: { resources: [] } },
          ],
        }),
        stderr: '',
      });
      await context.set(LOGGED_IN, true);

      vi.mocked(commands.executeCommand).mockImplementation(async (cmd: string) => {
        if (cmd === 'vscode.executeDocumentSymbolProvider') {
          return [{ name: 'resource' }];
        }
        return undefined;
      });

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');
      // Add two projects - only one matches the directory of new.tf
      ws.projects['/root/project'] = {} as any;
      ws.projects['/root/other-project'] = {} as any;

      const file = { uri: { path: '/root/project/new.tf' } };
      await ws.fileChange(file as any);

      expect(cli.exec).toHaveBeenCalledWith(
        expect.arrayContaining(['breakdown', '--path', '/root/project'])
      );
    });

    it('should do nothing when file not in any project', async () => {
      const cli = mockCli();
      await context.set(LOGGED_IN, true);

      vi.mocked(commands.executeCommand).mockImplementation(async (cmd: string) => {
        if (cmd === 'vscode.executeDocumentSymbolProvider') {
          return [{ name: 'resource' }];
        }
        return undefined;
      });

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      const file = { uri: { path: '/root/unknown/main.tf' } };
      await ws.fileChange(file as any);

      expect(cli.exec).not.toHaveBeenCalled();
    });

    it('should handle non-usage file change for sub-project', async () => {
      const cli = mockCli();
      await context.set(LOGGED_IN, true);

      vi.mocked(commands.executeCommand).mockImplementation(async (cmd: string) => {
        if (cmd === 'vscode.executeDocumentSymbolProvider') {
          return [{ name: 'resource' }];
        }
        return undefined;
      });

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      // Usage file not at root - should not trigger reinit
      const file = { uri: { path: '/root/subdir/infracost-usage.yml' } };
      await ws.fileChange(file as any);

      // It's not a tf file and not root config/usage, but isUsageFileChange is true
      // so isValid is true. But it's not isConfigFileChange and not root usage path.
      // So it goes to the normal file change path
    });
  });

  describe('run', () => {
    it('should handle template file path', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockImplementation((p: any) => {
        const s = String(p);
        return s.endsWith('infracost.yml.tmpl');
      });

      const cli = mockCli();
      cli.exec
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // generate config
        .mockResolvedValueOnce({
          // breakdown
          stdout: JSON.stringify({
            projects: [{ name: 'p', metadata: { path: '/root' }, breakdown: { resources: [] } }],
          }),
          stderr: '',
        });
      await context.set(LOGGED_IN, true);

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      await ws.run();

      expect(cli.exec).toHaveBeenCalledWith(
        expect.arrayContaining(['generate', 'config', '--template-path'])
      );
    });

    it('should set error when template generation has stderr', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockImplementation((p: any) =>
        String(p).endsWith('infracost.yml.tmpl')
      );

      const cli = mockCli();
      cli.exec.mockResolvedValue({ stdout: '', stderr: 'template error' });
      await context.set(LOGGED_IN, true);

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      const result = await ws.run();

      expect(result).toBeUndefined();
      expect(context.get(ERROR)).toBe('template error.');
    });

    it('should use config file when available', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockImplementation((p: any) => String(p).endsWith('infracost.yml'));

      const cli = mockCli();
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify({
          projects: [{ name: 'proj', metadata: { path: '/root' }, breakdown: { resources: [] } }],
        }),
        stderr: '',
      });
      await context.set(LOGGED_IN, true);

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      await ws.run();

      expect(cli.exec).toHaveBeenCalledWith(expect.arrayContaining(['--config-file']), '/root');
    });

    it('should use breakdown when no config file', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const cli = mockCli();
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify({
          projects: [{ name: 'proj', metadata: { path: '/root' }, breakdown: { resources: [] } }],
        }),
        stderr: '',
      });
      await context.set(LOGGED_IN, true);

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      await ws.run();

      expect(cli.exec).toHaveBeenCalledWith(
        expect.arrayContaining(['breakdown', '--path', '/root'])
      );
    });

    it('should handle errors and set ERROR context for init', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const cli = mockCli();
      cli.exec.mockRejectedValue(new Error('binary not found'));
      await context.set(LOGGED_IN, true);

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      const result = await ws.run();

      expect(result).toBeUndefined();
      expect(context.get(ERROR)).toContain('Error fetching cloud costs');
    });

    it('should set specific error message when changedProjectPaths provided', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const cli = mockCli();
      cli.exec.mockRejectedValue(new Error('binary not found'));
      await context.set(LOGGED_IN, true);

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      const result = await ws.run('/root/project');

      expect(result).toBeUndefined();
      expect(context.get(ERROR)).toContain('Could not run the infracost cmd');
    });
  });

  describe('runConfigFile', () => {
    it('should run with full config file when no changed paths', async () => {
      const cli = mockCli();
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify({ projects: [] }),
        stderr: '',
      });

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      await ws.runConfigFile([]);

      expect(cli.exec).toHaveBeenCalledWith(
        expect.arrayContaining(['breakdown', '--config-file']),
        '/root'
      );
    });

    it('should filter config file to changed projects only', async () => {
      const fs = await import('fs');
      const yaml = await import('js-yaml');

      vi.mocked(fs.openSync).mockReturnValue(1 as any);
      vi.mocked(fs.readSync).mockImplementation((_fd: any, buffer: any) => {
        buffer[0] = 0x48;
        return 5;
      });
      vi.mocked(fs.closeSync).mockReturnValue(undefined);
      vi.mocked(fs.readFileSync).mockReturnValue(
        yaml.dump({
          version: '0.1',
          projects: [
            { path: 'project-a', name: 'a' },
            { path: 'project-b', name: 'b' },
          ],
        })
      );

      const cli = mockCli();
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify({ projects: [] }),
        stderr: '',
      });

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      await ws.runConfigFile(['/root/project-a']);

      expect(fs.writeFileSync).toHaveBeenCalled();
      const writtenContent = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      const parsed = yaml.load(writtenContent) as any;
      expect(parsed.projects).toHaveLength(1);
      expect(parsed.projects[0].path).toBe('project-a');
    });
  });

  describe('runBreakdown', () => {
    it('should use root path when no changed paths', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const cli = mockCli();
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify({ projects: [] }),
        stderr: '',
      });

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      await ws.runBreakdown([]);

      expect(cli.exec).toHaveBeenCalledWith(
        expect.arrayContaining(['breakdown', '--path', '/root'])
      );
    });

    it('should run for each changed project path', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const cli = mockCli();
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify({
          projects: [{ name: 'p', metadata: { path: '/' }, breakdown: { resources: [] } }],
        }),
        stderr: '',
      });

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      await ws.runBreakdown(['/root/a', '/root/b']);

      expect(cli.exec).toHaveBeenCalledTimes(2);
    });

    it('should include project usage file if exists', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockImplementation(
        (p: any) => String(p) === path.join('/root/project', 'infracost-usage.yml')
      );

      const cli = mockCli();
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify({ projects: [] }),
        stderr: '',
      });

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      await ws.runBreakdown(['/root/project']);

      expect(cli.exec).toHaveBeenCalledWith(
        expect.arrayContaining(['--usage-file', path.join('/root/project', 'infracost-usage.yml')])
      );
    });

    it('should include root usage file if project-level one does not exist', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockImplementation(
        (p: any) => String(p) === path.join('/root', 'infracost-usage.yml')
      );

      const cli = mockCli();
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify({ projects: [] }),
        stderr: '',
      });

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      await ws.runBreakdown(['/root/project']);

      expect(cli.exec).toHaveBeenCalledWith(
        expect.arrayContaining(['--usage-file', path.join('/root', 'infracost-usage.yml')])
      );
    });
  });

  describe('renderProjectTree', () => {
    it('should build project hierarchy from JSON', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const cli = mockCli();
      const jsonOutput = {
        projects: [
          {
            name: 'proj',
            metadata: { path: '/root' },
            breakdown: {
              resources: [
                {
                  name: 'aws_instance.main',
                  monthlyCost: 100,
                  metadata: {
                    calls: [{ blockName: 'aws_instance.main', filename: 'main.tf', startLine: 1 }],
                  },
                  costComponents: [],
                  subresources: [],
                },
              ],
            },
          },
        ],
      };
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify(jsonOutput),
        stderr: '',
      });
      await context.set(LOGGED_IN, true);

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');
      await ws.init();

      expect(ws.projects['/root']).toBeDefined();
      expect(ws.projects['/root'].blocks['aws_instance.main']).toBeDefined();
    });

    it('should fire tree event when not init', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const cli = mockCli();
      const jsonOutput = {
        projects: [
          {
            name: 'proj',
            metadata: { path: '/root' },
            breakdown: { resources: [] },
          },
        ],
      };
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify(jsonOutput),
        stderr: '',
      });
      await context.set(LOGGED_IN, true);

      const treeEmitter = new EventEmitter<any>();
      const fireSpy = vi.spyOn(treeEmitter, 'fire');
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      await ws.run('/root');

      expect(fireSpy).toHaveBeenCalled();
    });

    it('should add usage file to filesToProjects if exists', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockImplementation((p: any) =>
        String(p).endsWith('infracost-usage.yml')
      );

      const cli = mockCli();
      const jsonOutput = {
        projects: [
          {
            name: 'proj',
            metadata: { path: '/root/project' },
            breakdown: { resources: [] },
          },
        ],
      };
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify(jsonOutput),
        stderr: '',
      });
      await context.set(LOGGED_IN, true);

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');
      await ws.init();

      const usagePath = path.join('/root/project', 'infracost-usage.yml');
      const normalizedKey = usagePath.split(path.sep).join('/');
      expect(ws.filesToProjects[normalizedKey]).toBeDefined();
    });

    it('should use project.name from JSON when hasConfigFile is true', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockImplementation((p: any) => String(p).endsWith('infracost.yml'));
      vi.mocked(fs.readFileSync).mockReturnValue(
        'version: "0.1"\nprojects:\n  - path: .\n    name: my-proj\n'
      );

      const cli = mockCli();
      const jsonOutput = {
        projects: [
          {
            name: 'custom-name',
            metadata: { path: '/root' },
            breakdown: { resources: [] },
          },
        ],
      };
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify(jsonOutput),
        stderr: '',
      });
      await context.set(LOGGED_IN, true);

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');
      await ws.init();

      expect(ws.projects['/root'].name).toBe('custom-name');
    });

    it('should resolve filename correctly on win32', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      try {
        const cli = mockCli();
        const jsonOutput = {
          projects: [
            {
              name: 'proj',
              metadata: { path: 'C:\\root' },
              breakdown: {
                resources: [
                  {
                    name: 'aws_instance.main',
                    monthlyCost: 100,
                    metadata: {
                      calls: [
                        { blockName: 'aws_instance.main', filename: 'main.tf', startLine: 1 },
                      ],
                    },
                    costComponents: [],
                    subresources: [],
                  },
                ],
              },
            },
          ],
        };
        cli.exec.mockResolvedValue({
          stdout: JSON.stringify(jsonOutput),
          stderr: '',
        });
        await context.set(LOGGED_IN, true);

        const treeEmitter = new EventEmitter<any>();
        const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');
        await ws.init();

        expect(ws.projects['C:\\root']).toBeDefined();
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });

    it('should handle multiple projects mapping to the same file', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const cli = mockCli();
      const jsonOutput = {
        projects: [
          {
            name: 'proj-a',
            metadata: { path: '/root/a' },
            breakdown: {
              resources: [
                {
                  name: 'module.shared',
                  monthlyCost: 10,
                  metadata: {
                    calls: [{ blockName: 'aws_instance.main', filename: 'main.tf', startLine: 1 }],
                  },
                  costComponents: [],
                  subresources: [],
                },
              ],
            },
          },
          {
            name: 'proj-b',
            metadata: { path: '/root/b' },
            breakdown: {
              resources: [
                {
                  name: 'module.shared',
                  monthlyCost: 20,
                  metadata: {
                    calls: [{ blockName: 'aws_instance.main', filename: 'main.tf', startLine: 1 }],
                  },
                  costComponents: [],
                  subresources: [],
                },
              ],
            },
          },
        ],
      };
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify(jsonOutput),
        stderr: '',
      });
      await context.set(LOGGED_IN, true);

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');
      await ws.init();

      // Both projects should exist
      expect(ws.projects['/root/a']).toBeDefined();
      expect(ws.projects['/root/b']).toBeDefined();
    });

    it('should handle multiple resources in the same file', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const cli = mockCli();
      const jsonOutput = {
        projects: [
          {
            name: 'proj',
            metadata: { path: '/root' },
            breakdown: {
              resources: [
                {
                  name: 'aws_instance.a',
                  monthlyCost: 50,
                  metadata: {
                    calls: [{ blockName: 'aws_instance.a', filename: 'main.tf', startLine: 1 }],
                  },
                  costComponents: [],
                  subresources: [],
                },
                {
                  name: 'aws_instance.b',
                  monthlyCost: 30,
                  metadata: {
                    calls: [{ blockName: 'aws_instance.b', filename: 'main.tf', startLine: 10 }],
                  },
                  costComponents: [],
                  subresources: [],
                },
              ],
            },
          },
        ],
      };
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify(jsonOutput),
        stderr: '',
      });
      await context.set(LOGGED_IN, true);

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');
      await ws.init();

      // Both blocks should exist under the same project
      expect(ws.projects['/root'].blocks['aws_instance.a']).toBeDefined();
      expect(ws.projects['/root'].blocks['aws_instance.b']).toBeDefined();

      // The file should map to the project (addProjectToFile called twice for same file)
      const resolvedFilename = ['/root', path.resolve(path.relative('/root', 'main.tf'))].join('');
      const normalizedKey = resolvedFilename.split(path.sep).join('/');
      expect(ws.filesToProjects[normalizedKey]).toEqual({ '/root': true });
    });

    it('should handle resources without calls', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const cli = mockCli();
      const jsonOutput = {
        projects: [
          {
            name: 'proj',
            metadata: { path: '/root' },
            breakdown: {
              resources: [
                {
                  name: 'aws_instance.main',
                  monthlyCost: 100,
                  metadata: {
                    calls: null,
                  },
                  costComponents: [],
                  subresources: [],
                },
              ],
            },
          },
        ],
      };
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify(jsonOutput),
        stderr: '',
      });
      await context.set(LOGGED_IN, true);

      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, vi.fn() as any, treeEmitter, 'USD');

      // Should not throw
      await ws.init();

      expect(ws.projects['/root']).toBeDefined();
    });

    it('should update existing webviews after render', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const cli = mockCli();
      const resolvedFilename = ['/root', path.resolve(path.relative('/root', 'main.tf'))].join('');
      const jsonOutput = {
        projects: [
          {
            name: 'proj',
            metadata: { path: '/root' },
            breakdown: {
              resources: [
                {
                  name: 'aws_instance.main',
                  monthlyCost: 50,
                  metadata: {
                    calls: [{ blockName: 'aws_instance.main', filename: 'main.tf', startLine: 1 }],
                  },
                  costComponents: [],
                  subresources: [],
                },
              ],
            },
          },
        ],
      };
      cli.exec.mockResolvedValue({
        stdout: JSON.stringify(jsonOutput),
        stderr: '',
      });
      await context.set(LOGGED_IN, true);

      const mockPanel = {
        webview: { html: '' },
        reveal: vi.fn(),
        onDidDispose: vi.fn(),
      };
      webviews.add(`${resolvedFilename}|aws_instance.main`, mockPanel as any);

      const template = vi.fn().mockReturnValue('<html>updated</html>');
      const treeEmitter = new EventEmitter<any>();
      const ws = new Workspace('/root', cli as any, template as any, treeEmitter, 'USD');
      await ws.init();

      // The block should have called display, which updates the webview
      expect(mockPanel.webview.html).toBe('<html>updated</html>');
      expect(mockPanel.reveal).toHaveBeenCalled();
    });
  });
});
