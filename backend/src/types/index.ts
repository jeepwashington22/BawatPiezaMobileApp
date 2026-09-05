export interface HealthReport {
  status: 'ok' | 'degraded';
  uptime: number;
  supabase: 'ok' | 'skipped';
  redis: 'ok' | 'degraded' | 'skipped';
  timestamp: string;
}
