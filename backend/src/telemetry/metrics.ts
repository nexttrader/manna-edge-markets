export class MetricsCollector {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private history: Array<{ timestamp: string, name: string, type: string, value: number }> = [];

  increment(name: string, amount: number = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + amount);
    this.history.push({ timestamp: new Date().toISOString(), name, type: 'counter', value: current + amount });
    if (this.history.length > 1000) this.history.shift();
  }

  decrement(name: string, amount: number = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current - amount);
    this.history.push({ timestamp: new Date().toISOString(), name, type: 'counter', value: current - amount });
    if (this.history.length > 1000) this.history.shift();
  }

  gauge(name: string, value: number): void {
    this.gauges.set(name, value);
    this.history.push({ timestamp: new Date().toISOString(), name, type: 'gauge', value });
    if (this.history.length > 1000) this.history.shift();
  }

  getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  getGauge(name: string): number {
    return this.gauges.get(name) || 0;
  }

  getAll(): { counters: Record<string, number>, gauges: Record<string, number> } {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges)
    };
  }

  getHistory(limit: number = 100): typeof this.history {
    return this.history.slice(-limit);
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.history = [];
  }
}

export const metrics = new MetricsCollector();
