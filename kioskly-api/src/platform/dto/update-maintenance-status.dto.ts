import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateMaintenanceStatusDto {
  @IsBoolean()
  @IsOptional()
  storePortalMaintenance?: boolean;

  @IsBoolean()
  @IsOptional()
  companyPortalMaintenance?: boolean;

  @IsBoolean()
  @IsOptional()
  mobileAppMaintenance?: boolean;
}
