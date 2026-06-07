import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from '@nestjs/cache-manager';

@Injectable()
export class TokenBlacklistService {
  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  async blacklist(jti: string, exp: number): Promise<void> {
    const ttlMs = (exp - Math.floor(Date.now() / 1000)) * 1000;
    if (ttlMs > 0) {
      await this.cache.set(`blacklist:${jti}`, 1, ttlMs);
    }
  }

  async isBlacklisted(jti: string): Promise<boolean> {
    return (await this.cache.get(`blacklist:${jti}`)) !== undefined;
  }
}
