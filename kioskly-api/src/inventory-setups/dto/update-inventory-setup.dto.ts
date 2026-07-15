import { PartialType } from '@nestjs/swagger';
import { CreateInventorySetupDto } from './create-inventory-setup.dto';

export class UpdateInventorySetupDto extends PartialType(CreateInventorySetupDto) {}
