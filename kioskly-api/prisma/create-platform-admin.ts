/**
 * Kioscify Platform Admin Bootstrap
 *
 * Creates the initial PLATFORM_ADMIN user. Run this once before first login
 * to kioscify-platform.
 *
 * Usage:
 *   npm run create:platform-admin   (from kioskly-api directory)
 *   npm run platform:bootstrap       (from monorepo root)
 */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import * as readline from 'readline';

const prisma = new PrismaClient();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())));
}

function generateSecurePassword(length = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$%!';
  const all = upper + lower + digits + symbols;

  const required = [
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    digits[crypto.randomInt(digits.length)],
    symbols[crypto.randomInt(symbols.length)],
  ];

  const rest = Array.from({ length: length - required.length }, () =>
    all[crypto.randomInt(all.length)],
  );

  return [...required, ...rest].sort(() => crypto.randomInt(3) - 1).join('');
}

async function main() {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' Kioscify Platform Admin Bootstrap');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Check if a PLATFORM_ADMIN already exists
  const existing = await prisma.user.findFirst({
    where: { role: 'PLATFORM_ADMIN' },
    select: { username: true, email: true, createdAt: true },
  });

  if (existing) {
    console.log('⚠️  A PLATFORM_ADMIN user already exists:');
    console.log(`   Username: ${existing.username}`);
    console.log(`   Email:    ${existing.email}`);
    console.log(`   Created:  ${existing.createdAt.toISOString()}`);
    console.log('');
    const proceed = await prompt('Create another PLATFORM_ADMIN anyway? (yes/no): ');
    if (proceed.toLowerCase() !== 'yes') {
      console.log('Aborted.');
      rl.close();
      return;
    }
    console.log('');
  }

  console.log('Enter details for the new Platform Admin:');
  console.log('');

  const firstName = await prompt('First name: ');
  const lastName  = await prompt('Last name: ');
  const email     = await prompt('Email: ');
  const username  = await prompt('Username: ');

  if (!firstName || !lastName || !email || !username) {
    console.error('✗ All fields are required.');
    rl.close();
    process.exit(1);
  }

  // Check username uniqueness (PLATFORM_ADMIN users have no tenantId scope)
  const taken = await prisma.user.findFirst({ where: { username } });
  if (taken) {
    console.error(`✗ Username "${username}" is already taken.`);
    rl.close();
    process.exit(1);
  }

  const password = generateSecurePassword();
  const hashed   = await bcrypt.hash(password, 12);

  console.log('');
  console.log('─── Creating PLATFORM_ADMIN ──────────────────────────────────');

  const user = await prisma.user.create({
    data: {
      firstName,
      lastName,
      username,
      email,
      password: hashed,
      role: 'PLATFORM_ADMIN',
      isFirstLogin: true,
      isActive: true,
    },
  });

  console.log(`  ✓ User created (id: ${user.id})`);
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' ✅ Platform Admin Created');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('Login credentials (save these now):');
  console.log(`  Username:  ${username}`);
  console.log(`  Password:  ${password}`);
  console.log('');
  console.log('⚠️  You will be prompted to change this password on first login.');
  console.log('⚠️  Store it securely — it will not be shown again.');
  console.log('');

  rl.close();
}

main()
  .catch((err) => {
    console.error('✗ Failed:', err.message);
    rl.close();
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
