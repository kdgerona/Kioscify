import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { ExportService } from '../export/export.service';

const mockCompaniesService = {};
const mockExportService = { streamCompanyExport: jest.fn() };

function mockRes() {
  return {} as any;
}

describe('CompaniesController', () => {
  let controller: CompaniesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompaniesController],
      providers: [
        { provide: CompaniesService, useValue: mockCompaniesService },
        { provide: ExportService, useValue: mockExportService },
      ],
    }).compile();
    controller = module.get<CompaniesController>(CompaniesController);
  });

  describe('exportCompany()', () => {
    it("throws ForbiddenException when a COMPANY_ADMIN from company A requests company B's export", async () => {
      const req = { user: { role: 'COMPANY_ADMIN', companyId: 'company-a' } };

      await expect(
        controller.exportCompany('company-b', req, mockRes()),
      ).rejects.toThrow(ForbiddenException);
      expect(mockExportService.streamCompanyExport).not.toHaveBeenCalled();
    });

    it('allows a COMPANY_ADMIN to export their own company', async () => {
      const req = { user: { role: 'COMPANY_ADMIN', companyId: 'company-a' } };
      const res = mockRes();

      await controller.exportCompany('company-a', req, res);

      expect(mockExportService.streamCompanyExport).toHaveBeenCalledWith(
        'company-a',
        res,
      );
    });

    it('allows PLATFORM_ADMIN to export any company', async () => {
      const req = { user: { role: 'PLATFORM_ADMIN', companyId: undefined } };
      const res = mockRes();

      await controller.exportCompany('any-company-id', req, res);

      expect(mockExportService.streamCompanyExport).toHaveBeenCalledWith(
        'any-company-id',
        res,
      );
    });
  });
});
