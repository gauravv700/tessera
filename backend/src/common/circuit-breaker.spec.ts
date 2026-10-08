import { CircuitBreaker } from './circuit-breaker';

describe('CircuitBreaker', () => {
  it('opens after threshold failures and short-circuits', async () => {
    const cb = new CircuitBreaker(2, 60_000);
    const boom = () => Promise.reject(new Error('boom'));
    await expect(cb.exec(boom)).rejects.toThrow('boom');
    await expect(cb.exec(boom)).rejects.toThrow('boom');
    expect(cb.isOpen).toBe(true);
    await expect(cb.exec(() => Promise.resolve(1))).rejects.toThrow('circuit open');
  });
  it('resets on success', async () => {
    const cb = new CircuitBreaker(2, 60_000);
    await expect(cb.exec(() => Promise.reject(new Error('x')))).rejects.toThrow();
    await expect(cb.exec(() => Promise.resolve(1))).resolves.toBe(1);
    expect(cb.isOpen).toBe(false);
  });
});
