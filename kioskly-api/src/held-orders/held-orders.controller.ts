import { Body, Controller, Delete, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HeldOrdersService } from './held-orders.service';
import { CreateHeldOrderDto } from './dto/create-held-order.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant.decorator';

@ApiTags('held-orders')
@Controller('held-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CASHIER', 'STORE_ADMIN', 'ADMIN')
@ApiBearerAuth()
export class HeldOrdersController {
  constructor(private heldOrdersService: HeldOrdersService) {}

  @SkipThrottle()
  @Post()
  @ApiOperation({ summary: 'Hold the current cart for later resume' })
  @ApiResponse({ status: 201, description: 'Held order created' })
  @ApiResponse({ status: 409, description: 'Already synced (duplicate clientId)' })
  create(@Body() dto: CreateHeldOrderDto, @Request() req, @TenantId() tenantId: string) {
    return this.heldOrdersService.create(dto, req.user.id, tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'List all held orders for the current store, oldest first' })
  findAll(@TenantId() tenantId: string) {
    return this.heldOrdersService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single held order' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.heldOrdersService.findOne(id, tenantId);
  }

  @Post(':id/resume')
  @ApiOperation({ summary: 'Fetch and delete a held order (resume into an active cart)' })
  @ApiResponse({ status: 404, description: 'Not found' })
  resume(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.heldOrdersService.resume(id, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Discard a held order' })
  @ApiResponse({ status: 404, description: 'Not found' })
  discard(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.heldOrdersService.discard(id, tenantId);
  }
}
