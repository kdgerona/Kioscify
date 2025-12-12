import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create Mr. Lemon - Maasin Branch tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'mr-lemon-maasin' },
    update: {},
    create: {
      name: 'Mr. Lemon - Maasin Branch',
      slug: 'mr-lemon-maasin',
      description: 'Refreshing lemonade and calamansi drinks',
      contactEmail: 'maasin@mrlemon.com',
      contactPhone: '+63 123 456 7890',
      address: 'Maasin City, Southern Leyte',
      logoUrl: '/uploads/logos/mrlemon-logo.jpg',
      themeColors: {
        primary: '#FAEB2E',
        secondary: '#FCDC32',
        accent: '#9BCF53',
        background: '#FAEB2E',
        text: '#000000',
      },
      isActive: true,
    },
  });
  console.log('✓ Created tenant:', tenant.name);

  // Create default admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: {
      tenantId_username: {
        tenantId: tenant.id,
        username: 'admin',
      },
    },
    update: {
      password: adminPassword,
      email: 'admin@mrlemon.com',
    },
    create: {
      tenantId: tenant.id,
      username: 'admin',
      email: 'admin@mrlemon.com',
      password: adminPassword,
      role: 'ADMIN',
    },
  });
  console.log('✓ Created admin user:', admin.username);

  // Create default cashier user
  const cashierPassword = await bcrypt.hash('cashier123', 10);
  const cashier = await prisma.user.upsert({
    where: {
      tenantId_username: {
        tenantId: tenant.id,
        username: 'cashier',
      },
    },
    update: {
      password: cashierPassword,
      email: 'cashier@mrlemon.com',
    },
    create: {
      tenantId: tenant.id,
      username: 'cashier',
      email: 'cashier@mrlemon.com',
      password: cashierPassword,
      role: 'CASHIER',
    },
  });
  console.log('✓ Created cashier user:', cashier.username);

  // Create categories
  const categories = [
    {
      id: 'lemonade',
      name: 'Lemonade',
      sequenceNo: 1,
      tenantId: tenant.id,
    },
    {
      id: 'hot-lemonade',
      name: 'Hot Lemonade',
      sequenceNo: 2,
      tenantId: tenant.id,
    },
    {
      id: 'calamansi',
      name: 'Calamansi',
      sequenceNo: 3,
      tenantId: tenant.id,
    },
    {
      id: 'hot-calamansi',
      name: 'Hot Calamansi',
      sequenceNo: 4,
      tenantId: tenant.id,
    },
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { id: category.id },
      update: { sequenceNo: category.sequenceNo },
      create: category,
    });
  }
  console.log('✓ Created categories');

  // Create sizes
  const sizes = [
    {
      id: 'regular-16oz',
      name: 'Regular',
      priceModifier: 0,
      volume: '16oz',
      tenantId: tenant.id,
    },
    {
      id: 'large-22oz',
      name: 'Large',
      priceModifier: 20,
      volume: '22oz',
      tenantId: tenant.id,
    },
    {
      id: 'regular-12oz',
      name: 'Regular',
      priceModifier: 0,
      volume: '12oz',
      tenantId: tenant.id,
    },
  ];

  for (const size of sizes) {
    await prisma.size.upsert({
      where: { id: size.id },
      update: {},
      create: size,
    });
  }
  console.log('✓ Created sizes');

  // Create addons
  const addons = [
    {
      id: 'nata-de-coco',
      name: 'Nata De Coco',
      price: 10,
      tenantId: tenant.id,
    },
    {
      id: 'popping-bobba',
      name: 'Popping Bobba',
      price: 20,
      tenantId: tenant.id,
    },
    { id: 'lemon-shot', name: 'Lemon Shot', price: 20, tenantId: tenant.id },
    { id: 'yakult', name: 'Yakult', price: 20, tenantId: tenant.id },
  ];

  for (const addon of addons) {
    await prisma.addon.upsert({
      where: { id: addon.id },
      update: {},
      create: addon,
    });
  }
  console.log('✓ Created addons');

  // Create products with their sizes and addons
  const products = [
    // Lemonade Category
    {
      id: 'lem-1',
      name: 'Classic Lemonade',
      price: 49,
      categoryId: 'lemonade',
      tenantId: tenant.id,
      image: '/uploads/products/classic-lemonade.png',
      sizeIds: ['regular-16oz', 'large-22oz'],
      addonIds: ['nata-de-coco', 'popping-bobba', 'lemon-shot', 'yakult'],
    },
    {
      id: 'lem-2',
      name: 'Classic Guava',
      price: 69,
      categoryId: 'lemonade',
      tenantId: tenant.id,
      image: '/uploads/products/guava-lemonade.png',
      sizeIds: ['regular-16oz', 'large-22oz'],
      addonIds: ['nata-de-coco', 'popping-bobba', 'lemon-shot', 'yakult'],
    },
    {
      id: 'lem-3',
      name: 'Classic Strawberry',
      price: 69,
      categoryId: 'lemonade',
      tenantId: tenant.id,
      image: '/uploads/products/strawberry-lemonade.png',
      sizeIds: ['regular-16oz', 'large-22oz'],
      addonIds: ['nata-de-coco', 'popping-bobba', 'lemon-shot', 'yakult'],
    },
    {
      id: 'lem-4',
      name: 'Classic Watermelon',
      price: 69,
      categoryId: 'lemonade',
      tenantId: tenant.id,
      image: '/uploads/products/watermelon-lemonade.png',
      sizeIds: ['regular-16oz', 'large-22oz'],
      addonIds: ['nata-de-coco', 'popping-bobba', 'lemon-shot', 'yakult'],
    },
    {
      id: 'lem-5',
      name: 'Classic Lychee',
      price: 69,
      categoryId: 'lemonade',
      tenantId: tenant.id,
      image: '/uploads/products/lychee-lemonade.png',
      sizeIds: ['regular-16oz', 'large-22oz'],
      addonIds: ['nata-de-coco', 'popping-bobba', 'lemon-shot', 'yakult'],
    },
    {
      id: 'lem-6',
      name: 'Classic Pineapple',
      price: 69,
      categoryId: 'lemonade',
      tenantId: tenant.id,
      image: '/uploads/products/pineapple-lemonade.png',
      sizeIds: ['regular-16oz', 'large-22oz'],
      addonIds: ['nata-de-coco', 'popping-bobba', 'lemon-shot', 'yakult'],
    },
    {
      id: 'lem-7',
      name: 'Green Apple',
      price: 55,
      categoryId: 'lemonade',
      tenantId: tenant.id,
      image: '/uploads/products/green-apple.png',
      sizeIds: ['regular-16oz', 'large-22oz'],
      addonIds: ['nata-de-coco', 'popping-bobba', 'lemon-shot', 'yakult'],
    },
    {
      id: 'lem-8',
      name: 'Strawberry',
      price: 55,
      categoryId: 'lemonade',
      tenantId: tenant.id,
      image: '/uploads/products/strawberry.png',
      sizeIds: ['regular-16oz', 'large-22oz'],
      addonIds: ['nata-de-coco', 'popping-bobba', 'lemon-shot', 'yakult'],
    },
    {
      id: 'lem-9',
      name: 'Kiwi',
      price: 55,
      categoryId: 'lemonade',
      tenantId: tenant.id,
      image: '/uploads/products/kiwi.png',
      sizeIds: ['regular-16oz', 'large-22oz'],
      addonIds: ['nata-de-coco', 'popping-bobba', 'lemon-shot', 'yakult'],
    },
    {
      id: 'lem-10',
      name: 'Peach',
      price: 55,
      categoryId: 'lemonade',
      tenantId: tenant.id,
      image: '/uploads/products/peach.png',
      sizeIds: ['regular-16oz', 'large-22oz'],
      addonIds: ['nata-de-coco', 'popping-bobba', 'lemon-shot', 'yakult'],
    },
    {
      id: 'lem-11',
      name: 'Mango',
      price: 55,
      categoryId: 'lemonade',
      tenantId: tenant.id,
      image: '/uploads/products/mango.png',
      sizeIds: ['regular-16oz', 'large-22oz'],
      addonIds: ['nata-de-coco', 'popping-bobba', 'lemon-shot', 'yakult'],
    },
    {
      id: 'lem-12',
      name: 'Ube Lemonade',
      price: 59,
      categoryId: 'lemonade',
      tenantId: tenant.id,
      sizeIds: ['regular-16oz', 'large-22oz'],
      addonIds: ['nata-de-coco', 'popping-bobba', 'lemon-shot', 'yakult'],
    },
    {
      id: 'lem-13',
      name: 'Passion Fruit Lemonade',
      price: 59,
      categoryId: 'lemonade',
      tenantId: tenant.id,
      sizeIds: ['regular-16oz', 'large-22oz'],
      addonIds: ['nata-de-coco', 'popping-bobba', 'lemon-shot', 'yakult'],
    },
    // Hot Lemonade Category
    {
      id: 'hot-lem-1',
      name: 'Classic Lemonade',
      price: 49,
      categoryId: 'hot-lemonade',
      tenantId: tenant.id,
      image: '/uploads/products/hot-classic-lemonade.png',
      sizeIds: ['regular-12oz'],
      addonIds: [],
    },
    {
      id: 'hot-lem-2',
      name: 'Ginger Lemonade',
      price: 69,
      categoryId: 'hot-lemonade',
      tenantId: tenant.id,
      image: '/uploads/products/hot-ginger-lemonade.png',
      sizeIds: ['regular-12oz'],
      addonIds: [],
    },
    // Calamansi Category
    {
      id: 'cal-1',
      name: 'Classic Calamansi',
      price: 39,
      categoryId: 'calamansi',
      tenantId: tenant.id,
      image: '/uploads/products/classic-calamansi.png',
      sizeIds: ['regular-16oz', 'large-22oz'],
      addonIds: ['nata-de-coco', 'popping-bobba', 'yakult'],
    },
    {
      id: 'cal-2',
      name: 'Guava',
      price: 59,
      categoryId: 'calamansi',
      tenantId: tenant.id,
      image: '/uploads/products/guava-calamansi.png',
      sizeIds: ['regular-16oz', 'large-22oz'],
      addonIds: ['nata-de-coco', 'popping-bobba', 'yakult'],
    },
    {
      id: 'cal-3',
      name: 'Strawberry',
      price: 59,
      categoryId: 'calamansi',
      tenantId: tenant.id,
      image: '/uploads/products/strawberry-calamansi.png',
      sizeIds: ['regular-16oz', 'large-22oz'],
      addonIds: ['nata-de-coco', 'popping-bobba', 'yakult'],
    },
    {
      id: 'cal-4',
      name: 'Watermelon',
      price: 59,
      categoryId: 'calamansi',
      tenantId: tenant.id,
      image: '/uploads/products/watermelon-calamansi.png',
      sizeIds: ['regular-16oz', 'large-22oz'],
      addonIds: ['nata-de-coco', 'popping-bobba', 'yakult'],
    },
    {
      id: 'cal-5',
      name: 'Lychee',
      price: 59,
      categoryId: 'calamansi',
      tenantId: tenant.id,
      image: '/uploads/products/lychee-calamansi.png',
      sizeIds: ['regular-16oz', 'large-22oz'],
      addonIds: ['nata-de-coco', 'popping-bobba', 'yakult'],
    },
    {
      id: 'cal-6',
      name: 'Pineapple',
      price: 59,
      categoryId: 'calamansi',
      tenantId: tenant.id,
      image: '/uploads/products/pineapple-calamansi.png',
      sizeIds: ['regular-16oz', 'large-22oz'],
      addonIds: ['nata-de-coco', 'popping-bobba', 'yakult'],
    },
    {
      id: 'cal-7',
      name: 'Mango Calamansi',
      price: 49,
      categoryId: 'calamansi',
      tenantId: tenant.id,
      image: '/uploads/products/mango-calamansi.png',
      sizeIds: ['regular-16oz', 'large-22oz'],
      addonIds: ['nata-de-coco', 'popping-bobba', 'yakult'],
    },
    // Hot Calamansi Category
    {
      id: 'hot-cal-1',
      name: 'Classic Calamansi',
      price: 39,
      categoryId: 'hot-calamansi',
      tenantId: tenant.id,
      image: '/uploads/products/hot-classic-calamansi.png',
      sizeIds: ['regular-12oz'],
      addonIds: [],
    },
    {
      id: 'hot-cal-2',
      name: 'Ginger Calamansi',
      price: 59,
      categoryId: 'hot-calamansi',
      tenantId: tenant.id,
      image: '/uploads/products/hot-ginger-calamansi.png',
      sizeIds: ['regular-12oz'],
      addonIds: [],
    },
  ];

  for (const product of products) {
    const { sizeIds, addonIds, ...productData } = product;

    await prisma.product.upsert({
      where: { id: product.id },
      update: {
        image: productData.image,
      },
      create: {
        ...productData,
        productSizes: {
          create: sizeIds.map((sizeId) => ({
            size: { connect: { id: sizeId } },
          })),
        },
        productAddons: {
          create: addonIds.map((addonId) => ({
            addon: { connect: { id: addonId } },
          })),
        },
      },
    });
  }
  console.log('✓ Created products with sizes and addons');

  console.log('🎉 Database seeding completed successfully!');
  console.log('\n📝 Tenant Information:');
  console.log(`  Name: ${tenant.name}`);
  console.log(`  Slug: ${tenant.slug}`);
  console.log('\n📝 Default credentials:');
  console.log('  Admin: username=admin, password=admin123');
  console.log('  Cashier: username=cashier, password=cashier123\n');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
