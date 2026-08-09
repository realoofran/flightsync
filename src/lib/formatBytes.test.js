import { describe, it, expect } from 'vitest';
import { formatBytes } from './formatBytes.js';

describe('formatBytes', () => {
  it('formats zero/negative/non-finite as 0 B', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
  });

  it('formats bytes below 1024 as a whole B value', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('formats into KB/MB/GB at the right thresholds', () => {
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
  });

  it('drops to one decimal once the value reaches double digits', () => {
    expect(formatBytes(12.34 * 1024 * 1024 * 1024)).toBe('12.3 GB');
  });
});
