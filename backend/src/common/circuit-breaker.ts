/** Minimal circuit breaker: opens after N consecutive failures, half-opens after a cool-down. */
export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  constructor(private threshold = 5, private coolDownMs = 30_000) {}

  get isOpen(): boolean {
    return this.failures >= this.threshold && Date.now() - this.openedAt < this.coolDownMs;
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen) throw new Error('circuit open');
    try {
      const res = await fn();
      this.failures = 0;
      return res;
    } catch (e) {
      this.failures++;
      if (this.failures >= this.threshold) this.openedAt = Date.now();
      throw e;
    }
  }
}
