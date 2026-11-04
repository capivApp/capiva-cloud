import { z } from "zod";

// Global: precisa rodar antes do primeiro parse. Mensagem escrita à mão no schema continua vencendo.
z.config(z.locales.pt());
