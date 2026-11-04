import prisma from "@database/prisma";
import { hashPassword } from "@auth/password";

/**
 * Seed/reset do usuário administrador. Idempotente:
 *  - usuário não existe → cria usuário + organização (OWNER);
 *  - usuário existe     → apenas redefine a senha.
 *
 * Uso (variáveis com defaults seguros para dev):
 *   ADMIN_EMAIL=adm@empresa.com ADMIN_PASSWORD='troque-me' bun run seed:admin
 */
const email = process.env.ADMIN_EMAIL ?? "admin@capiva.local";
const password = process.env.ADMIN_PASSWORD ?? "capiva-admin";
const name = process.env.ADMIN_NAME ?? "Administrador";
const organizationName = process.env.ADMIN_ORG ?? "Capiva";

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

async function ensureOrganization(userId: string): Promise<void> {
  const membership = await prisma.membership.findFirst({ where: { userId } });
  if (membership) return;

  const slug = slugify(organizationName);
  const organization =
    (await prisma.organization.findUnique({ where: { slug } })) ??
    (await prisma.organization.create({ data: { name: organizationName, slug } }));

  await prisma.membership.create({
    data: { userId, organizationId: organization.id, role: "OWNER" },
  });
}

async function seed(): Promise<void> {
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, name, passwordHash },
  });
  await ensureOrganization(user.id);
  console.log(
    `✅ Admin pronto: ${email} (senha ${process.env.ADMIN_PASSWORD ? "definida via ADMIN_PASSWORD" : `padrão "${password}" — troque!`})`,
  );
}

seed()
  .catch((error) => {
    console.error("❌ Seed falhou:", (error as Error).message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
