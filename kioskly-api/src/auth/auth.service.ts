import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto, tenantId: string) {
    const { username, password, email, role } = registerDto;

    // Check if user already exists in this tenant
    const existingUser = await this.prisma.user.findFirst({
      where: {
        tenantId,
        OR: [{ username }, { email }],
      },
    });

    if (existingUser) {
      throw new ConflictException('Username or email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        tenantId,
        username,
        password: hashedPassword,
        email,
        role,
      },
      select: {
        id: true,
        tenantId: true,
        username: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return user;
  }

  async login(loginDto: LoginDto, tenantId: string) {
    const { username, password } = loginDto;

    // Find user in tenant
    const user = await this.prisma.user.findFirst({
      where: {
        tenantId,
        username,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate JWT token with tenantId
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId,
    };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tenantId: true,
        username: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }
}
