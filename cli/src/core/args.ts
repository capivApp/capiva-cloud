import { CliError } from "@core/errors";

export type FlagValue = string | boolean;

export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, FlagValue>;
}

/** Flags que recebem valor (`--token cap_...` ou `--token=cap_...`). As demais são booleanas. */
const VALUE_FLAGS = new Set(["token", "api-url"]);

/** Atalhos de uma letra. */
const SHORT_FLAGS: Record<string, string> = { f: "follow", h: "help" };

interface ParserState extends ParsedArgs {
  rest: boolean;
}

type TokenParser = (token: string, next: () => string | undefined, state: ParserState) => void;

const parseLong: TokenParser = (token, next, state) => {
  const [rawName = "", inline] = token.slice(2).split(/=(.*)/s);
  if (inline !== undefined) {
    state.flags[rawName] = inline;
    return;
  }
  if (!VALUE_FLAGS.has(rawName)) {
    state.flags[rawName] = true;
    return;
  }
  const value = next();
  if (value === undefined || value.startsWith("-")) throw new CliError(`--${rawName} precisa de um valor.`);
  state.flags[rawName] = value;
};

const parseShort: TokenParser = (token, _next, state) => {
  for (const letter of token.slice(1)) state.flags[SHORT_FLAGS[letter] ?? letter] = true;
};

const parsePositional: TokenParser = (token, _next, state) => {
  state.positionals.push(token);
};

const pickParser = (token: string, state: ParserState): TokenParser => {
  if (state.rest || token === "-" || !token.startsWith("-")) return parsePositional;
  return token.startsWith("--") ? parseLong : parseShort;
};

/** Parser de argumentos sem dependência: posicionais, `--flag`, `--flag=valor`, `-f` e `--`. */
export function parseArgs(argv: string[]): ParsedArgs {
  const state: ParserState = { positionals: [], flags: {}, rest: false };
  let index = 0;
  const next = () => argv[++index];
  for (; index < argv.length; index++) {
    const token = argv[index] ?? "";
    if (token === "--" && !state.rest) {
      state.rest = true;
      continue;
    }
    pickParser(token, state)(token, next, state);
  }
  return { positionals: state.positionals, flags: state.flags };
}
