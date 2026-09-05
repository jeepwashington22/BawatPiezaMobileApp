import { Redis } from 'ioredis';

/**
 * Redis client abstraction.
 *
 * If UPSTASH_REDIS_REST_URL is set, uses the Upstash REST API (works on
 * serverless/edge environments where raw TCP is unavailable). Otherwise
 * falls back to a TCP ioredis client using REDIS_URL.
 */

interface RedisLike {
  ping(): Promise<string>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: 'EX', ttlSeconds?: number): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
}

class UpstashRestClient implements RedisLike {
  constructor(
    private readonly url: string,
    private readonly token: string
  ) {}

  private async run(...commands: (string | number)[]): Promise<unknown> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });

    if (!response.ok) {
      throw new Error(`Upstash REST request failed: HTTP ${response.status}`);
    }

    const json = (await response.json()) as { result?: unknown; error?: string };
    if (json.error) {
      throw new Error(`Upstash REST error: ${json.error}`);
    }
    return json.result;
  }

  async ping(): Promise<string> {
    return (await this.run('PING')) as string;
  }

  async get(key: string): Promise<string | null> {
    return (await this.run('GET', key)) as string | null;
  }

  async set(key: string, value: string, mode?: 'EX', ttlSeconds?: number): Promise<string | null> {
    const args: (string | number)[] = ['SET', key, value];
    if (mode === 'EX' && ttlSeconds !== undefined) {
      args.push('EX', ttlSeconds);
    }
    return (await this.run(...args)) as string | null;
  }

  async del(...keys: string[]): Promise<number> {
    return (await this.run('DEL', ...keys)) as number;
  }

  async incr(key: string): Promise<number> {
    return (await this.run('INCR', key)) as number;
  }

  async expire(key: string, seconds: number): Promise<number> {
    return (await this.run('EXPIRE', key, seconds)) as number;
  }

  async ttl(key: string): Promise<number> {
    return (await this.run('TTL', key)) as number;
  }
}

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

export let redis: RedisLike;

let dispose: () => Promise<void> = async () => {};

if (upstashUrl && upstashToken) {
  redis = new UpstashRestClient(upstashUrl, upstashToken);
  console.log('[redis] using Upstash REST client');
} else {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    throw new Error(
      'Missing Redis configuration. Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or REDIS_URL (e.g. redis://localhost:6379) in your environment.'
    );
  }

  const client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => Math.min(times * 100, 2000),
  });

  client.on('error', (err: Error) => {
    console.error('[redis] error:', err.message);
  });

  client.on('connect', () => {
    console.log('[redis] connected');
  });

  redis = client as unknown as RedisLike;

  dispose = async () => {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  };
}

export async function connectRedis(): Promise<void> {
  await redis.ping();
}

export async function disconnectRedis(): Promise<void> {
  await dispose();
}
