import { describe, it, expect, vi } from 'vitest';
import File from '../file';

describe('File', () => {
  describe('constructor', () => {
    it('should set properties correctly', () => {
      const template = vi.fn();
      const file = new File('/path/main.tf', 'USD', template as any);

      expect(file.name).toBe('/path/main.tf');
      expect(file.currency).toBe('USD');
      expect(file.blocks).toEqual({});
    });
  });

  describe('setBlock', () => {
    it('should create a new block', () => {
      const file = new File('/path/main.tf', 'USD', vi.fn() as any);

      const block = file.setBlock('aws_instance.main', 5);

      expect(block.name).toBe('aws_instance.main');
      expect(block.startLine).toBe(5);
      expect(block.filename).toBe('/path/main.tf');
      expect(file.blocks['aws_instance.main']).toBe(block);
    });

    it('should return existing block if already set', () => {
      const file = new File('/path/main.tf', 'USD', vi.fn() as any);

      const block1 = file.setBlock('aws_instance.main', 5);
      const block2 = file.setBlock('aws_instance.main', 10);

      expect(block1).toBe(block2);
      expect(block1.startLine).toBe(5);
    });

    it('should create multiple blocks', () => {
      const file = new File('/path/main.tf', 'USD', vi.fn() as any);

      file.setBlock('aws_instance.a', 1);
      file.setBlock('aws_instance.b', 10);

      expect(Object.keys(file.blocks)).toHaveLength(2);
    });
  });

  describe('getBlock', () => {
    it('should return existing block', () => {
      const file = new File('/path/main.tf', 'USD', vi.fn() as any);
      const block = file.setBlock('aws_instance.main', 5);

      expect(file.getBlock('aws_instance.main')).toBe(block);
    });

    it('should return undefined for non-existing block', () => {
      const file = new File('/path/main.tf', 'USD', vi.fn() as any);

      expect(file.getBlock('nonexistent')).toBeUndefined();
    });
  });

  describe('rawCost', () => {
    it('should return 0 when no blocks', () => {
      const file = new File('/path/main.tf', 'USD', vi.fn() as any);

      expect(file.rawCost()).toBe(0);
    });

    it('should sum costs of all blocks', () => {
      const file = new File('/path/main.tf', 'USD', vi.fn() as any);
      const block1 = file.setBlock('a', 1);
      block1.resources = [{ monthlyCost: 10 } as any];
      const block2 = file.setBlock('b', 5);
      block2.resources = [{ monthlyCost: 20 } as any];

      expect(file.rawCost()).toBeCloseTo(30);
    });
  });

  describe('cost', () => {
    it('should format total cost as currency string', () => {
      const file = new File('/path/main.tf', 'USD', vi.fn() as any);
      const block = file.setBlock('a', 1);
      block.resources = [{ monthlyCost: 42.5 } as any];

      expect(file.cost()).toBe('$42.50');
    });

    it('should return $0.00 for empty file', () => {
      const file = new File('/path/main.tf', 'USD', vi.fn() as any);

      expect(file.cost()).toBe('$0.00');
    });
  });
});
