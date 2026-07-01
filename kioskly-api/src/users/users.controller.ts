import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { SessionsService } from '../sessions/sessions.service';
import type { SessionStatus } from '../sessions/sessions.service';
import {
  CreateStoreUserDto,
  UpdateStoreUserDto,
  CreateCompanyUserDto,
  UpdateCompanyUserDto,
} from './dto/user.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrivilegeGuard } from '../common/guards/privilege.guard';
import { StorePrivilegeGuard } from '../common/guards/store-privilege.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePrivilege } from '../common/decorators/require-privilege.decorator';
import { RequireStorePrivilege } from '../common/decorators/require-store-privilege.decorator';
import { TenantId, CompanyId } from '../common/decorators/tenant.decorator';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(
    private usersService: UsersService,
    private sessionsService: SessionsService,
  ) {}

  // ─── Store users (STORE_ADMIN manages their own store) ────────────────────

  @Get('stores/:storeId')
  @UseGuards(RolesGuard, StorePrivilegeGuard)
  @Roles('STORE_ADMIN', 'PLATFORM_ADMIN')
  @RequireStorePrivilege('users', 'read')
  @ApiOperation({ summary: 'List users in a store' })
  getStoreUsers(@Param('storeId') storeId: string, @Request() req) {
    return this.usersService.getStoreUsers(storeId, req.user.role, req.user.id);
  }

  @Get('stores/:storeId/sessions')
  @UseGuards(RolesGuard, StorePrivilegeGuard)
  @Roles('STORE_ADMIN', 'PLATFORM_ADMIN')
  @RequireStorePrivilege('users', 'read')
  @ApiOperation({ summary: "List a store's login sessions (Store Admins/Cashiers)" })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'ENDED', 'EXPIRED'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getStoreSessions(
    @Param('storeId') storeId: string,
    @Query('search') search?: string,
    @Query('status') status?: SessionStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.sessionsService.listForStore(storeId, { search, status, page, limit });
  }

  @Get('stores/:storeId/assignable-pool')
  @UseGuards(RolesGuard)
  @Roles('STORE_ADMIN', 'PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Get users assignable to a store (scoped to managed stores)' })
  getAssignablePool(
    @Param('storeId') storeId: string,
    @Query('q') query: string,
    @Request() req,
  ) {
    return this.usersService.getAssignablePool(storeId, req.user.id, req.user.role, query ?? '');
  }

  @Post('stores/:storeId')
  @UseGuards(RolesGuard, StorePrivilegeGuard)
  @Roles('STORE_ADMIN', 'PLATFORM_ADMIN')
  @RequireStorePrivilege('users', 'write')
  @ApiOperation({ summary: 'Create a store user (returns temporary password)' })
  createStoreUser(
    @Param('storeId') storeId: string,
    @Body() dto: CreateStoreUserDto,
    @TenantId() tenantId: string,
    @Request() req,
  ) {
    return this.usersService.createStoreUser(storeId, tenantId, dto, req.user.id, req.user.role);
  }

  @Patch('stores/:storeId/:userId')
  @UseGuards(RolesGuard, StorePrivilegeGuard)
  @Roles('STORE_ADMIN')
  @RequireStorePrivilege('users', 'write')
  @ApiOperation({ summary: 'Update a store user' })
  updateStoreUser(
    @Param('storeId') storeId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateStoreUserDto,
    @TenantId() tenantId: string,
    @Request() req,
  ) {
    return this.usersService.updateStoreUser(storeId, userId, tenantId, req.user.id, dto, req.user.storePrivileges ?? null);
  }

  @Delete('stores/:storeId/:userId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard, StorePrivilegeGuard)
  @Roles('STORE_ADMIN')
  @RequireStorePrivilege('users', 'all')
  @ApiOperation({ summary: 'Deactivate a store user (soft delete)' })
  deleteStoreUser(
    @Param('storeId') storeId: string,
    @Param('userId') userId: string,
    @TenantId() tenantId: string,
    @Request() req,
  ) {
    return this.usersService.deleteStoreUser(storeId, userId, tenantId, req.user.id);
  }

  @Post('stores/:storeId/:userId/reset-password')
  @UseGuards(RolesGuard, StorePrivilegeGuard)
  @Roles('STORE_ADMIN', 'PLATFORM_ADMIN')
  @RequireStorePrivilege('users', 'write')
  @ApiOperation({ summary: 'Reset a store user\'s password (generates new temporary password)' })
  resetStoreUserPassword(
    @Param('storeId') storeId: string,
    @Param('userId') userId: string,
    @TenantId() tenantId: string,
    @Request() req,
  ) {
    return this.usersService.resetStoreUserPassword(storeId, userId, req.user.id, tenantId, req.user.role);
  }

  // ─── Company users (COMPANY_ADMIN manages their own company) ─────────────

  @Get('companies/:companyId')
  @UseGuards(RolesGuard, PrivilegeGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @RequirePrivilege('users', 'read')
  @ApiOperation({ summary: 'List COMPANY_ADMIN users for a company' })
  getCompanyUsers(
    @Param('companyId') companyId: string,
    @CompanyId() requestingCompanyId: string,
    @Request() req,
  ) {
    return this.usersService.getCompanyUsers(companyId, requestingCompanyId, req.user.role);
  }

  // ─── Platform: login sessions across companies ────────────────────────────

  @Get('sessions')
  @UseGuards(RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiOperation({ summary: 'List login sessions for Company Admins and Store users, filterable by company' })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'ENDED', 'EXPIRED'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getPlatformSessions(
    @Query('companyId') companyId?: string,
    @Query('search') search?: string,
    @Query('status') status?: SessionStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.sessionsService.listForCompany({ companyId, search, status, page, limit });
  }

  // ─── Platform: all users for a company ────────────────────────────────────

  @Get('company/:companyId/all')
  @UseGuards(RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Get all users (company admins + store staff) for a company' })
  getCompanyAllUsers(@Param('companyId') companyId: string) {
    return this.usersService.getCompanyAllUsers(companyId);
  }

  @Post(':userId/reset-password')
  @UseGuards(RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Reset a user\'s password (generates new temporary password)' })
  resetPassword(@Param('userId') userId: string) {
    return this.usersService.resetPassword(userId);
  }

  @Post('companies/:companyId')
  @UseGuards(RolesGuard, PrivilegeGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @RequirePrivilege('users', 'write')
  @ApiOperation({ summary: 'Create additional COMPANY_ADMIN user (returns temporary password)' })
  createCompanyUser(
    @Param('companyId') companyId: string,
    @Body() dto: CreateCompanyUserDto,
    @CompanyId() requestingCompanyId: string,
    @Request() req,
  ) {
    return this.usersService.createCompanyUser(companyId, requestingCompanyId, dto, req.user.companyPrivileges ?? null, req.user.role);
  }

  @Patch('companies/:companyId/:userId')
  @UseGuards(RolesGuard, PrivilegeGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @RequirePrivilege('users', 'write')
  @ApiOperation({ summary: 'Update a company user' })
  updateCompanyUser(
    @Param('companyId') companyId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateCompanyUserDto,
    @CompanyId() requestingCompanyId: string,
    @Request() req,
  ) {
    return this.usersService.updateCompanyUser(companyId, userId, requestingCompanyId, req.user.role, req.user.id, dto, req.user.companyPrivileges ?? null);
  }

  @Delete('companies/:companyId/:userId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard, PrivilegeGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @RequirePrivilege('users', 'all')
  @ApiOperation({ summary: 'Remove a company user (soft delete)' })
  deleteCompanyUser(
    @Param('companyId') companyId: string,
    @Param('userId') userId: string,
    @CompanyId() requestingCompanyId: string,
    @Request() req,
  ) {
    return this.usersService.deleteCompanyUser(companyId, userId, requestingCompanyId, req.user.role, req.user.id);
  }

  @Post('companies/:companyId/:userId/reset-password')
  @UseGuards(RolesGuard, PrivilegeGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @RequirePrivilege('users', 'write')
  @ApiOperation({ summary: "Reset a company user's password" })
  resetCompanyUserPassword(
    @Param('companyId') companyId: string,
    @Param('userId') userId: string,
    @CompanyId() requestingCompanyId: string,
    @Request() req,
  ) {
    return this.usersService.resetCompanyUserPassword(companyId, userId, requestingCompanyId, req.user.role, req.user.id);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Remove any user (PLATFORM_ADMIN only)' })
  deleteUser(
    @Param('userId') userId: string,
    @Request() req,
  ) {
    return this.usersService.deleteUser(userId, req.user.id);
  }

  // ─── Multi-store access management ───────────────────────────────────────

  @Get(':userId/stores')
  @UseGuards(RolesGuard)
  @Roles('STORE_ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiOperation({ summary: 'List all stores a user has access to' })
  getStoreAccess(@Param('userId') userId: string, @Request() req) {
    if (req.user.role === 'STORE_ADMIN' && userId !== req.user.id) {
      throw new ForbiddenException('STORE_ADMIN can only query their own store access');
    }
    return this.usersService.getStoreAccess(userId);
  }

  @Post('stores/:storeId/assign')
  @UseGuards(RolesGuard)
  @Roles('STORE_ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Link an existing user to a store' })
  assignUserToStore(
    @Param('storeId') storeId: string,
    @Body() dto: { username: string; role: 'STORE_ADMIN' | 'CASHIER' },
    @CompanyId() companyId: string,
    @Request() req,
  ) {
    return this.usersService.assignUserToStore(storeId, dto, companyId, req.user.role, req.user.id);
  }

  @Delete('stores/:storeId/:userId/access')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('STORE_ADMIN', 'COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Revoke a user\'s access to a store' })
  revokeStoreAccess(
    @Param('storeId') storeId: string,
    @Param('userId') userId: string,
    @CompanyId() companyId: string,
    @Request() req,
  ) {
    return this.usersService.revokeStoreAccess(storeId, userId, companyId, req.user.role, req.user.id);
  }

  @Get('search')
  @UseGuards(RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Search users within a company (for store assignment)' })
  searchUsers(
    @Query('q') query: string,
    @Query('companyId') queryCompanyId: string,
    @CompanyId() jwtCompanyId: string,
  ) {
    return this.usersService.searchUsersInCompany(queryCompanyId || jwtCompanyId, query ?? '');
  }
}
