import { describe, it, expect, vi } from 'vitest';
import Project from '../project';

describe('Project', () => {
  describe('constructor', () => {
    it('should set properties correctly', () => {
      const template = vi.fn();
      const project = new Project('my-project', '/path/to/project', 'USD', template as any);

      expect(project.name).toBe('my-project');
      expect(project.path).toBe('/path/to/project');
      expect(project.currency).toBe('USD');
      expect(project.files).toEqual({});
      expect(project.blocks).toEqual({});
    });
  });

  describe('setBlock', () => {
    it('should create a file and block', () => {
      const project = new Project('proj', '/path', 'USD', vi.fn() as any);

      const block = project.setBlock('/path/main.tf', 'aws_instance.main', 5);

      expect(block.name).toBe('aws_instance.main');
      expect(project.files['/path/main.tf']).toBeDefined();
      expect(project.blocks['aws_instance.main']).toBe(block);
    });

    it('should reuse existing file', () => {
      const project = new Project('proj', '/path', 'USD', vi.fn() as any);

      project.setBlock('/path/main.tf', 'aws_instance.a', 1);
      project.setBlock('/path/main.tf', 'aws_instance.b', 10);

      expect(Object.keys(project.files)).toHaveLength(1);
      expect(Object.keys(project.blocks)).toHaveLength(2);
    });

    it('should not overwrite existing block in project.blocks', () => {
      const project = new Project('proj', '/path', 'USD', vi.fn() as any);

      const block1 = project.setBlock('/path/main.tf', 'aws_instance.main', 1);
      block1.resources = [{ monthlyCost: 100 } as any];

      const block2 = project.setBlock('/path/main.tf', 'aws_instance.main', 1);

      expect(block2).toBe(block1);
      expect(project.blocks['aws_instance.main']).toBe(block1);
    });
  });

  describe('getBlock', () => {
    it('should return block from file', () => {
      const project = new Project('proj', '/path', 'USD', vi.fn() as any);
      const block = project.setBlock('/path/main.tf', 'aws_instance.main', 5);

      expect(project.getBlock('/path/main.tf', 'aws_instance.main')).toBe(block);
    });

    it('should return undefined for non-existing file', () => {
      const project = new Project('proj', '/path', 'USD', vi.fn() as any);

      expect(project.getBlock('/nonexistent.tf', 'test')).toBeUndefined();
    });

    it('should return undefined for non-existing block', () => {
      const project = new Project('proj', '/path', 'USD', vi.fn() as any);
      project.setBlock('/path/main.tf', 'aws_instance.main', 5);

      expect(project.getBlock('/path/main.tf', 'nonexistent')).toBeUndefined();
    });
  });

  describe('cost', () => {
    it('should sum all block costs', () => {
      const project = new Project('proj', '/path', 'USD', vi.fn() as any);
      const block1 = project.setBlock('/path/a.tf', 'a', 1);
      block1.resources = [{ monthlyCost: 50 } as any];
      const block2 = project.setBlock('/path/b.tf', 'b', 1);
      block2.resources = [{ monthlyCost: 30 } as any];

      expect(project.cost()).toBe('$80.00');
    });

    it('should return $0.00 for empty project', () => {
      const project = new Project('proj', '/path', 'USD', vi.fn() as any);

      expect(project.cost()).toBe('$0.00');
    });
  });
});
