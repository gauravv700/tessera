import { parseDecimal, formatScaled } from './units';

describe('units', () => {
  it('parses decimals exactly', () => {
    expect(parseDecimal('65000.10', 2)).toBe(6500010);
    expect(parseDecimal('0.000001', 6)).toBe(1);
    expect(parseDecimal('3', 2)).toBe(300);
  });
  it('rejects bad input', () => {
    expect(() => parseDecimal('1.234', 2)).toThrow();
    expect(() => parseDecimal('-1', 2)).toThrow();
    expect(() => parseDecimal('abc', 2)).toThrow();
  });
  it('formats and trims zeros', () => {
    expect(formatScaled(6500010, 2)).toBe('65000.1');
    expect(formatScaled(1n, 6)).toBe('0.000001');
    expect(formatScaled('10000000000000', 8)).toBe('100000');
  });
});
