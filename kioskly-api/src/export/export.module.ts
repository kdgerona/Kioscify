import { Module } from '@nestjs/common';
import { ExportService } from './export.service';

// No controller here — the export endpoints live on CompaniesController /
// StoresController (GET /companies/:id/export, GET /stores/:id/export) so
// they reuse the "own company/store only" scoping already established
// there. This module exists purely to share the ZIP-streaming/data-
// gathering logic between CompaniesModule and StoresModule.
@Module({
  providers: [ExportService],
  exports: [ExportService],
})
export class ExportModule {}
