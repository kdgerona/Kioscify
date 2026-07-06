import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenBlacklistService } from '../token-blacklist.service';
import { auth } from '../../constants/env.constants';

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
  tenantId?: string;
  brandId?: string;
  companyId?: string;
  mustChangePassword?: boolean;
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  tenantId?: string | null;
  brandId?: string | null;
  companyId?: string | null;
  isFirstLogin: boolean;
  mustChangePassword: boolean;
  jti?: string;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tokenBlacklist: TokenBlacklistService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService?.get(auth.jwt_secret) || '',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        tenantId: true,
        brandId: true,
        companyId: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isFirstLogin: true,
        isActive: true,
        tombstone: true,
        storeAccess: {
          where: { isActive: true },
          select: { tenantId: true },
        },
      },
    });

    if (!user || !user.isActive || user.tombstone === 1) {
      throw new UnauthorizedException();
    }

    if (payload.jti && (await this.tokenBlacklist.isBlacklisted(payload.jti))) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // Build the complete set of stores this user can access — unbounded,
    // covers primary store plus every active UserStoreAccess row.
    const jwtTenantId = payload.tenantId;
    const accessibleTenantIds = new Set([
      user.tenantId,
      ...user.storeAccess.map((a) => a.tenantId),
    ]);
    const effectiveTenantId =
      jwtTenantId && accessibleTenantIds.has(jwtTenantId)
        ? jwtTenantId
        : user.tenantId;

    // When the JWT's tenantId is accepted, also honour its brandId/companyId
    // since they are stamped together by the server in loginStore/switchStore.
    const usingJwtStore = effectiveTenantId === jwtTenantId;

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: effectiveTenantId,
      brandId: usingJwtStore && payload.brandId ? payload.brandId : user.brandId,
      companyId: usingJwtStore && payload.companyId ? payload.companyId : user.companyId,
      isFirstLogin: user.isFirstLogin,
      mustChangePassword: user.isFirstLogin,
      jti: payload.jti,
      exp: payload.exp,
    };
  }
}
