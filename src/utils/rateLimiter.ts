export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly maxTokens: number,
    private readonly refillIntervalMs: number,
    private readonly refillAmount: number,
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed >= this.refillIntervalMs) {
      const refills = Math.floor(elapsed / this.refillIntervalMs);
      this.tokens = Math.min(this.maxTokens, this.tokens + refills * this.refillAmount);
      this.lastRefill += refills * this.refillIntervalMs;
    }
  }

  async consume(count: number = 1): Promise<void> {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return;
    }
    const waitTime = this.refillIntervalMs - (Date.now() - this.lastRefill);
    await new Promise((resolve) => setTimeout(resolve, waitTime + 1));
    return this.consume(count);
  }
}

export const tmdbRateLimiter = new TokenBucket(40, 10000, 40);
