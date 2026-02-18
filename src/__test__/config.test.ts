import { describe, it, expect } from 'vitest';
import { ConfigFile, ConfigProject } from '../config';

describe('config types', () => {
  it('should define ConfigFile type correctly', () => {
    const config: ConfigFile = {
      version: '0.1',
      projects: [{ path: './project1', name: 'project1', skip_autodetect: false }],
    };

    expect(config.version).toBe('0.1');
    expect(config.projects).toHaveLength(1);
  });

  it('should define ConfigProject type correctly', () => {
    const project: ConfigProject = {
      path: './infra',
      name: 'my-infra',
      skip_autodetect: true,
    };

    expect(project.path).toBe('./infra');
    expect(project.name).toBe('my-infra');
    expect(project.skip_autodetect).toBe(true);
  });
});
