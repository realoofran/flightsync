import { describe, it, expect } from 'vitest';
import { isMsfsRunning } from './processWatcher.js';

describe('isMsfsRunning', () => {
  it('resolves to a boolean without throwing, regardless of whether MSFS is actually running', async () => {
    const result = await isMsfsRunning();
    expect(typeof result).toBe('boolean');
  });
});
