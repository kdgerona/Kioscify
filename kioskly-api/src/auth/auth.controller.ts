import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  LoginDto,
  CompanyLoginDto,
  PlatformLoginDto,
  ChangePasswordDto,
  SwitchStoreDto,
} from './dto/login.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedUser } from './strategies/jwt.strategy';

// Configurable via env — defaults to 20 attempts per 15 min
const LOGIN_THROTTLE = {
  default: {
    ttl:   parseInt(process.env.THROTTLE_LOGIN_TTL   ?? '900000'),  // 15 min window
    limit: parseInt(process.env.THROTTLE_LOGIN_LIMIT ?? '20'),      // attempts per window
  },
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle(LOGIN_THROTTLE)
  @ApiOperation({ summary: 'Store user login (STORE_ADMIN / CASHIER)' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many login attempts' })
  login(@Body() dto: LoginDto) {
    return this.authService.loginStore(dto);
  }

  @Post('company-login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle(LOGIN_THROTTLE)
  @ApiOperation({ summary: 'Company admin login (COMPANY_ADMIN)' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many login attempts' })
  companyLogin(@Body() dto: CompanyLoginDto) {
    return this.authService.loginCompany(dto);
  }

  @Post('platform-login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle(LOGIN_THROTTLE)
  @ApiOperation({ summary: 'Platform admin login (PLATFORM_ADMIN)' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many login attempts' })
  platformLogin(@Body() dto: PlatformLoginDto) {
    return this.authService.loginPlatform(dto);
  }

  @Post('switch-store')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Switch active store (for STORE_ADMIN with multiple stores)' })
  @ApiResponse({ status: 200, description: 'New JWT with updated store context' })
  @ApiResponse({ status: 403, description: 'No access to that store' })
  switchStore(@Body() dto: SwitchStoreDto, @Request() req) {
    return this.authService.switchStore(req.user.id, dto.targetStoreId);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password (required on first login)' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Password does not meet requirements' })
  @ApiResponse({ status: 401, description: 'Current password is incorrect' })
  changePassword(@Body() dto: ChangePasswordDto, @Request() req) {
    return this.authService.changePassword(req.user.id, dto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved' })
  getProfile(@Request() req) {
    return this.authService.getProfile(req.user.id);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and revoke current token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(@Request() req): Promise<{ message: string }> {
    const user = req.user as AuthenticatedUser;
    if (user.jti && user.exp) {
      await this.authService.logout(user.jti, user.exp);
    }
    return { message: 'Logged out successfully' };
  }
}
