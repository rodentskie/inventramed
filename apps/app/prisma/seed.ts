import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcrypt';
import { PrismaClient } from '../src/generated/prisma/client';
import { permissionSchema, type GrantablePermission } from '../src/lib/permissions';

interface SystemRole {
  name: string;
  description: string;
  permissions: GrantablePermission[];
}

const SYSTEM_ROLES: SystemRole[] = [
  { name: 'admin', description: 'Full access', permissions: ['*'] },
  {
    name: 'staff',
    description: 'Manages medicines and inventory',
    permissions: ['medicine:*', 'inventory:*', 'notification:read'],
  },
  {
    name: 'collaborator',
    description: 'Read-only access to inventory',
    permissions: ['medicine:read', 'inventory:read', 'notification:read'],
  },
];

const BCRYPT_SALT_ROUNDS = 12;
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'superpw64';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function seedRole({ name, description, permissions }: SystemRole) {
  const validated = permissions.map((p) => permissionSchema.parse(p));

  await prisma.$transaction(async (tx) => {
    const role = await tx.role.upsert({
      where: { name },
      update: { description, isSystem: true },
      create: { name, description, isSystem: true },
    });
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    await tx.rolePermission.createMany({
      data: validated.map((permission) => ({ roleId: role.id, permission })),
    });
  });
}

// Empty `update` so re-running the seed never resets a changed password.
async function seedAdminUser() {
  const passwordHash = await hash(DEFAULT_ADMIN_PASSWORD, BCRYPT_SALT_ROUNDS);

  await prisma.user.upsert({
    where: { username: DEFAULT_ADMIN_USERNAME },
    update: {},
    create: {
      username: DEFAULT_ADMIN_USERNAME,
      passwordHash,
      role: { connect: { name: 'admin' } },
      employee: {
        create: { firstName: 'System', lastName: 'Administrator' },
      },
    },
  });
}

async function main() {
  for (const role of SYSTEM_ROLES) {
    await seedRole(role);
  }
  console.log(`Seeded ${SYSTEM_ROLES.length} system roles`);

  await seedAdminUser();
  console.log(`Seeded admin user "${DEFAULT_ADMIN_USERNAME}"`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
