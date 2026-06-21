import fs from "fs/promises";
import path from "path";

/**
 * Auto-discovery: importa Repositories, Services, Controllers e Reconcilers para
 * que o container DI e os decorators registrem as classes. Ignora .d.ts e testes.
 */
async function importAll(folder: string): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(folder, { withFileTypes: true });
  } catch {
    return; // pasta ainda não existe — ok
  }

  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(folder, entry.name);
      if (entry.isDirectory()) return importAll(fullPath);
      if (!fullPath.endsWith(".ts") && !fullPath.endsWith(".js")) return;
      if (fullPath.endsWith(".d.ts") || fullPath.includes(".test.") || fullPath.includes(".spec.")) return;
      await import(fullPath);
    }),
  );
}

export async function bootstrapRegistry(): Promise<void> {
  const base = path.resolve(__dirname, "..");
  console.log("[BOOTSTRAP] carregando repositories, services e reconcilers...");
  await importAll(path.join(base, "repository"));
  await importAll(path.join(base, "infra"));
  await importAll(path.join(base, "service"));
  await importAll(path.join(base, "controller"));
  console.log("[BOOTSTRAP] registry carregado.");
}
