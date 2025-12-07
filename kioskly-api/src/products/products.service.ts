import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { app as appConstants } from '../constants/env.constants';
import { Prisma } from '@prisma/client';

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: {
    category: true;
    productSizes: {
      include: {
        size: true;
      };
    };
    productAddons: {
      include: {
        addon: true;
      };
    };
  };
}>;

@Injectable()
export class ProductsService {
  private baseUrl: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>(appConstants.base_url) || '';
  }

  async create(createProductDto: CreateProductDto, tenantId: string) {
    const { id, name, price, categoryId, image, sizeIds, addonIds } =
      createProductDto;

    const existingProduct = await this.prisma.product.findUnique({
      where: { id },
    });

    if (existingProduct) {
      throw new ConflictException('Product with this ID already exists');
    }

    // Create product with sizes and addons
    const product = await this.prisma.product.create({
      data: {
        id,
        name,
        price,
        categoryId,
        image,
        tenantId,
        productSizes: sizeIds
          ? {
              create: sizeIds.map((sizeId) => ({
                size: { connect: { id: sizeId } },
              })),
            }
          : undefined,
        productAddons: addonIds
          ? {
              create: addonIds.map((addonId) => ({
                addon: { connect: { id: addonId } },
              })),
            }
          : undefined,
      },
      include: {
        category: true,
        productSizes: {
          include: {
            size: true,
          },
        },
        productAddons: {
          include: {
            addon: true,
          },
        },
      },
    });

    return this.formatProduct(product);
  }

  async findAll(tenantId: string, categoryId?: string) {
    const where: Prisma.ProductWhereInput = { tenantId };
    if (categoryId) {
      where.categoryId = categoryId;
    }

    const products = await this.prisma.product.findMany({
      where,
      include: {
        category: true,
        productSizes: {
          include: {
            size: true,
          },
        },
        productAddons: {
          include: {
            addon: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return products.map((product) => this.formatProduct(product));
  }

  async findOne(id: string, tenantId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
      include: {
        category: true,
        productSizes: {
          include: {
            size: true,
          },
        },
        productAddons: {
          include: {
            addon: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return this.formatProduct(product);
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    tenantId: string,
  ) {
    await this.findOne(id, tenantId); // Check if exists

    const { sizeIds, addonIds, ...productData } = updateProductDto;

    // Update product and its relations
    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...productData,
        ...(sizeIds !== undefined && {
          productSizes: {
            deleteMany: {},
            create: sizeIds.map((sizeId) => ({
              size: { connect: { id: sizeId } },
            })),
          },
        }),
        ...(addonIds !== undefined && {
          productAddons: {
            deleteMany: {},
            create: addonIds.map((addonId) => ({
              addon: { connect: { id: addonId } },
            })),
          },
        }),
      },
      include: {
        category: true,
        productSizes: {
          include: {
            size: true,
          },
        },
        productAddons: {
          include: {
            addon: true,
          },
        },
      },
    });

    return this.formatProduct(product);
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId); // Check if exists

    return this.prisma.product.delete({
      where: { id },
    });
  }

  private formatProduct(product: ProductWithRelations) {
    // Transform image URL to absolute URL if it's a relative path
    const imageUrl =
      product.image && !product.image.startsWith('http')
        ? `${this.baseUrl}${product.image}`
        : product.image;

    return {
      id: product.id,
      name: product.name,
      price: product.price,
      categoryId: product.categoryId,
      image: imageUrl,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      category: product.category,
      sizes: product.productSizes?.map((ps) => ps.size) || [],
      addons: product.productAddons?.map((pa) => pa.addon) || [],
    };
  }
}
