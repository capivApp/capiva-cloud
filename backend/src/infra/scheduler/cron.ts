/**
 * Avaliador mínimo de expressões cron de 5 campos
 * (minuto hora dia-do-mês mês dia-da-semana), sem dependência externa — no
 * mesmo espírito do scheduler de uptime (roda no processo da API).
 *
 * Suporta por campo: `*`, listas `a,b`, intervalos `a-b` e passos (`*` barra `n`).
 * Dia-da-semana usa 0–6 (0 = domingo); 7 também é aceito como domingo.
 * Usa o horário local do servidor (semântica de cron de host).
 */
export function cronMatches(expr: string, date: Date): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`Expressão cron inválida (esperado 5 campos): "${expr}"`);
  const [min, hour, dom, mon, dow] = fields;
  return (
    matchField(min, date.getMinutes(), 0, 59) &&
    matchField(hour, date.getHours(), 0, 23) &&
    matchField(dom, date.getDate(), 1, 31) &&
    matchField(mon, date.getMonth() + 1, 1, 12) &&
    matchField(normalizeDow(dow), date.getDay(), 0, 6)
  );
}

/** Valida sintaticamente uma expressão cron (lança em caso de erro). */
export function assertValidCron(expr: string): void {
  cronMatches(expr, new Date());
}

/** Normaliza o campo de dia-da-semana convertendo 7 → 0 (ambos = domingo). */
function normalizeDow(field: string): string {
  return field.replace(/\b7\b/g, "0");
}

function matchField(field: string, value: number, min: number, max: number): boolean {
  return field.split(",").some((part) => matchPart(part, value, min, max));
}

function matchPart(part: string, value: number, min: number, max: number): boolean {
  if (part === "*") return true;

  const [range, stepRaw] = part.split("/");
  const step = stepRaw ? Number(stepRaw) : 1;
  if (!Number.isInteger(step) || step <= 0) throw new Error(`Passo cron inválido: "${part}"`);

  let lo = min;
  let hi = max;
  if (range !== "*") {
    const [a, b] = range.split("-");
    lo = Number(a);
    hi = b !== undefined ? Number(b) : a !== undefined && stepRaw ? max : Number(a);
    if (!Number.isInteger(lo) || !Number.isInteger(hi)) throw new Error(`Campo cron inválido: "${part}"`);
    // Sem passo e sem hífen → valor único.
    if (b === undefined && !stepRaw) return value === lo;
  }
  if (value < lo || value > hi) return false;
  return (value - lo) % step === 0;
}
