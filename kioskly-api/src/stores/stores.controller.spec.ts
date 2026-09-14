import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';
import { ExportService } from '../export/export.service';

const mockStoresService = {};
const mockExportService = { streamStoreExport: jest.fn() };

function mockRes() {
  return {} as any;
}

describe('StoresController', () => {
  let controller: StoresController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StoresController],
      providers: [
        { provide: StoresService, useValue: mockStoresService },
        { provide: ExportService, useValue: mockExportService },
      ],
    }).compile();
    controller = module.get<StoresController>(StoresController);
  });

  describe('exportStore()', () => {
    it("throws ForbiddenException when a STORE_ADMIN from store A requests store B's export", async () => {
      const req = { user: { role: 'STORE_ADMIN', tenantId: 'store-a' } };

      await expect(
        controller.exportStore('store-b', req, mockRes()),
      ).rejects.toThrow(ForbiddenException);
      expect(mockExportService.streamStoreExport).not.toHaveBeenCalled();
    });

    it('allows a STORE_ADMIN to export their own store', async () => {
      const req = { user: { role: 'STORE_ADMIN', tenantId: 'store-a' } };
      const res = mockRes();

      await controller.exportStore('store-a', req, res);

      expect(mockExportService.streamStoreExport).toHaveBeenCalledWith(
        'store-a',
        res,
      );
    });

    it('allows PLATFORM_ADMIN to export any store', async () => {
      const req = { user: { role: 'PLATFORM_ADMIN', tenantId: undefined } };
      const res = mockRes();

      await controller.exportStore('any-store-id', req, res);

      expect(mockExportService.streamStoreExport).toHaveBeenCalledWith(
        'any-store-id',
        res,
      );
    });
  });
});
