import { BadRequestException, Injectable } from '@nestjs/common';
import { RewardProgramType } from '@prisma/client';
import type { RewardTypeHandler } from './types/reward-type-handler.interface';
import { LoyaltyCardHandler } from './types/loyalty-card.handler';

/**
 * Maps each RewardProgramType to its handler. A new reward type is one enum
 * value in schema.prisma plus one handler registered here.
 */
@Injectable()
export class RewardTypeRegistry {
  private readonly handlers = new Map<RewardProgramType, RewardTypeHandler>();

  constructor() {
    this.register(new LoyaltyCardHandler());
  }

  register(handler: RewardTypeHandler) {
    this.handlers.set(handler.type, handler);
  }

  get(type: RewardProgramType): RewardTypeHandler {
    const handler = this.handlers.get(type);
    if (!handler)
      throw new BadRequestException(`Unsupported reward program type: ${type}`);
    return handler;
  }

  types(): RewardProgramType[] {
    return Array.from(this.handlers.keys());
  }
}
