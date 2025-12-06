import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { auth } from '../../constants/env.constants';

interface JwtPayload {
  sub: string;
  username: string;
  role?: 'ADMIN' | 'CASHIER';
  tenantId?: string;
  iat?: number;
  exp?: number;
}

interface ValidatedUser {
  id: string;
  tenantId: string;
  username: string;
  email: string;
  role: 'ADMIN' | 'CASHIER';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService?.get(auth.jwt_secret) || '',
    });
  }

  async validate(payload: JwtPayload): Promise<ValidatedUser> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const user = (await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        tenantId: true,
        username: true,
        email: true,
        role: true,
      },
    })) as ValidatedUser | null;

    if (!user) {
      throw new UnauthorizedException();
    }

    return user;
  }
}
