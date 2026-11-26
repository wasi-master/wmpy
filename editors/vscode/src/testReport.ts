// `wmpy test --json` and `wmpy check --json`: their shapes, and finding the
// tests in a file before anything has run. No vscode import.

export interface Diag {
  severity: "error" | "warning" | "info" | "hint" | string;
  code?: string | null;
  message: string;
  file?: string | null;
  line?: number | null;
  col?: number | null;
  endCol?: number | null;
  traceback?: string | null;
  notes?: string[] | null;
  help?: string | null;
}

export interface TestResult {
  file: string;
  name: string;
  ok: boolean;
  durationMs?: number;
  output?: string;
  error?: Diag | null;
}

export interface TestReport {
  ok: boolean;
  passed: number;
  failed: number;
  durationMs?: number;
  tests: TestResult[];
}

export interface CheckReport {
  ok: boolean;
  errors: number;
  warnings: number;
  problems: Diag[];
}

/**
 * The JSON object a `--json` run printed. The object is the whole of stdout,
 * or, if a plugin printed lines before it, the last line that parses.
 */
export function parseJsonOutput<T>(stdout: string): T | undefined {
  const whole = stdout.trim();
  if (!whole) return undefined;
  try {
    return JSON.parse(whole) as T;
  } catch {
    // fall through to the last line that is an object
  }
  const lines = whole.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith("{")) continue;
    try {
      return JSON.parse(line) as T;
    } catch {
      continue;
    }
  }
  return undefined;
}

export function isTestReport(v: unknown): v is TestReport {
  return !!v && typeof v === "object" && Array.isArray((v as TestReport).tests);
}

/** Whether [relPath] (inside a plugin, `/`-separated) is a file `wmpy test` runs. */
export function isTestFile(relPath: string): boolean {
  const p = relPath.replace(/\\/g, "/");
  if (!p.endsWith(".py")) return false;
  const base = p.slice(p.lastIndexOf("/") + 1);
  if (p.startsWith("tests/")) return true;
  if (p.includes("/")) return false;
  return base === "test.py" || base.startsWith("test_") || base.endsWith("_test.py");
}

export interface FoundTest {
  name: string;
  /** 0-based. */
  line: number;
}

/** The top-level `def test_…` functions in [source], in order. */
export function findTests(source: string): FoundTest[] {
  const out: FoundTest[] = [];
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^def\s+(test_[A-Za-z0-9_]*)\s*\(/.exec(lines[i]);
    if (m) out.push({ name: m[1], line: i });
  }
  return out;
}

/** The text of a failure for the Test Results view: the message, then the traceback, notes and help. */
export function failureText(d: Diag): string {
  const parts = [d.code ? `${d.message} [${d.code}]` : d.message];
  if (d.traceback) parts.push(d.traceback.trimEnd());
  for (const n of d.notes ?? []) parts.push(`note: ${n}`);
  if (d.help) parts.push(`help: ${d.help}`);
  return parts.join("\n\n");
}

/** Terminal-style newlines, which the Test Results output needs. */
export function crlf(text: string): string {
  return text.replace(/\r?\n/g, "\r\n");
}
