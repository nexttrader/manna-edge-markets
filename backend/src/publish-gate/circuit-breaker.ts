export class CircuitBreaker {
  private failures: number[] = [];
  private readonly threshold: number;
  private readonly windowMs: number;
  private tripped: boolean = false;

  constructor(threshold: number = 3, windowMs: number = 30 * 60 * 1000) {
    this.threshold = threshold;
    this.windowMs = windowMs;
  }

  recordFailure(): void {
    const now = Date.now();
    this.failures.push(now);
    
    // Clean old failures outside window
    this.failures = this.failures.filter(time => now - time <= this.windowMs);
    
    if (this.failures.length >= this.threshold) {
      this.tripped = true;
    }
  }

  isTripped(): boolean {
    if (this.tripped) {
      // Auto-recover if window has passed since last failure
      const now = Date.now();
      const lastFailure = this.failures[this.failures.length - 1] || 0;
      if (now - lastFailure > this.windowMs) {
        this.reset();
      }
    }
    return this.tripped;
  }

  reset(): void {
    this.failures = [];
    this.tripped = false;
  }

  getStatus(): { 
    tripped: boolean, 
    failureCount: number, 
    windowMinutes: number, 
    lastFailure?: string,
    resetsAt?: string,
    timeRemainingMs?: number 
  } {
    const isCurrentlyTripped = this.isTripped();
    const lastFailureMs = this.failures.length > 0 ? this.failures[this.failures.length - 1] : undefined;
    const resetsAtMs = lastFailureMs ? lastFailureMs + this.windowMs : undefined;
    const now = Date.now();

    return {
      tripped: isCurrentlyTripped,
      failureCount: this.failures.length,
      windowMinutes: this.windowMs / 60000,
      lastFailure: lastFailureMs ? new Date(lastFailureMs).toISOString() : undefined,
      resetsAt: resetsAtMs ? new Date(resetsAtMs).toISOString() : undefined,
      timeRemainingMs: (isCurrentlyTripped && resetsAtMs) ? Math.max(0, resetsAtMs - now) : 0
    };
  }
}

export const circuitBreaker = new CircuitBreaker();
