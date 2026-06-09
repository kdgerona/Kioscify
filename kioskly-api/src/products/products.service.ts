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
import * as fs from 'fs';
import * as path from 'path';

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
    productPreferences: {
      include: {
        preference: true;
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

  async create(createProductDto: CreateProductDto, brandId: string) {
    const { id, name, price, foodpandaPrice, grabPrice, categoryId, image, sizeIds, addonIds, preferenceIds } =
      createProductDto;

    // Generate ID from product name if not provided
    let productId = id;
    if (!productId) {
      productId = await this.generateProductId(name);
    } else {
      // Check if manually provided ID already exists
      const existingProduct = await this.prisma.product.findUnique({
        where: { id: productId },
      });

      if (existingProduct) {
        throw new ConflictException('Product with this ID already exists');
      }
    }

    // Create product with sizes and addons
    const product = await this.prisma.product.create({
      data: {
        id: productId,
        name,
        price,
        foodpandaPrice,
        grabPrice,
        categoryId,
        image,
        brandId,
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
        productPreferences: preferenceIds
          ? {
              create: preferenceIds.map((preferenceId) => ({
                preference: { connect: { id: preferenceId } },
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
        productPreferences: {
          include: {
            preference: true,
          },
        },
      },
    });

    return this.formatProduct(product);
  }

  private async generateProductId(name: string): Promise<string> {
    // Create slug from product name
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Check if slug already exists globally — _id is unique across all brands in MongoDB
    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const existing = await this.prisma.product.findUnique({
        where: { id: slug },
        select: { id: true },
      });

      if (!existing) {
        return slug;
      }

      counter++;
      slug = `${baseSlug}-${counter}`;
    }
  }

  async findAll(brandId: string, categoryId?: string) {
    const where: Prisma.ProductWhereInput = { brandId, tombstone: { not: 1 } };
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
        productPreferences: {
          include: {
            preference: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return products.map((product) => this.formatProduct(product));
  }

  async findOne(id: string, brandId?: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, ...(brandId ? { brandId } : {}), tombstone: { not: 1 } },
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
        productPreferences: {
          include: {
            preference: true,
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
    brandId: string,
  ) {
    await this.findOne(id, brandId); // Check if exists

    const { sizeIds, addonIds, preferenceIds, ...productData } = updateProductDto;

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
        ...(preferenceIds !== undefined && {
          productPreferences: {
            deleteMany: {},
            create: preferenceIds.map((preferenceId) => ({
              preference: { connect: { id: preferenceId } },
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
        productPreferences: {
          include: {
            preference: true,
          },
        },
      },
    });

    return this.formatProduct(product);
  }

  async updateImage(id: string, imageUrl: string, brandId: string) {
    const existing = await this.findOne(id, brandId);

    if (existing.image) {
      const relativePath = existing.image.startsWith('http')
        ? new URL(existing.image).pathname
        : existing.image;
      const filePath = path.join(process.cwd(), relativePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: { image: imageUrl },
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
        productPreferences: {
          include: {
            preference: true,
          },
        },
      },
    });

    return this.formatProduct(product);
  }

  async removeImage(id: string, brandId: string) {
    const existing = await this.findOne(id, brandId);

    if (existing.image) {
      // Strip any base URL prefix to get the relative path (e.g. /uploads/products/file.jpg)
      const relativePath = existing.image.startsWith('http')
        ? new URL(existing.image).pathname
        : existing.image;
      const filePath = path.join(process.cwd(), relativePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: { image: null },
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
        productPreferences: {
          include: {
            preference: true,
          },
        },
      },
    });

    return this.formatProduct(product);
  }

  async remove(id: string, brandId: string) {
    await this.findOne(id, brandId); // Check if exists

    return this.prisma.product.update({
      where: { id },
      data: { tombstone: 1 },
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
      foodpandaPrice: product.foodpandaPrice ?? null,
      grabPrice: product.grabPrice ?? null,
      categoryId: product.categoryId,
      image: imageUrl,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      category: product.category,
      sizes: (product.productSizes?.map((ps) => ps.size) || [])
        .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0)),
      addons: (product.productAddons?.map((pa) => pa.addon) || [])
        .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0)),
      preferences: (product.productPreferences?.map((pp) => pp.preference) || [])
        .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0)),
    };
  }
}
