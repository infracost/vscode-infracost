import { describe, it, expect, vi } from 'vitest';
import { Uri, Location, Range, Position } from 'vscode';
import { JumpToDefinitionCommand, InfracostCommand } from '../command';
import Block from '../block';

describe('JumpToDefinitionCommand', () => {
  it('should set the command to vscode.open', () => {
    const uri = Uri.file('/path/to/file.tf');
    const location = new Location(uri, new Range(new Position(5, 0), new Position(5, 10)));

    const cmd = new JumpToDefinitionCommand('Go to Definition', uri, location);

    expect(cmd.command).toBe('vscode.open');
    expect(cmd.title).toBe('Go to Definition');
  });

  it('should push uri and selection to arguments', () => {
    const uri = Uri.file('/path/to/file.tf');
    const range = new Range(new Position(5, 0), new Position(5, 10));
    const location = new Location(uri, range);

    const cmd = new JumpToDefinitionCommand('Title', uri, location);

    expect(cmd.arguments).toHaveLength(2);
    expect(cmd.arguments[0]).toBe(uri);
    expect(cmd.arguments[1]).toEqual({ selection: range });
  });
});

describe('InfracostCommand', () => {
  it('should set the command to infracost.resourceBreakdown', () => {
    const block = new Block('test', 1, '/file.tf', 'USD', vi.fn() as any);

    const cmd = new InfracostCommand('Total: $10.00', block);

    expect(cmd.command).toBe('infracost.resourceBreakdown');
    expect(cmd.title).toBe('Total: $10.00');
  });

  it('should include the block in arguments', () => {
    const block = new Block('test', 1, '/file.tf', 'USD', vi.fn() as any);

    const cmd = new InfracostCommand('Title', block);

    expect(cmd.arguments).toEqual([block]);
  });
});
