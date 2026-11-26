// The Test Explorer for plugins: one item per plugin, its test files under
// it and their test_* functions under those, run with `wmpy test --json`.

import * as path from "node:path";
import * as vscode from "vscode";
import { run } from "./cli";
import { PluginIndex } from "./plugins";
import { crlf, failureText, findTests, isTestFile, isTestReport, parseJsonOutput, TestReport, TestResult } from "./testReport";

const PATTERN = "{test.py,test_*.py,*_test.py,tests/**/*.py}";

export class Tests implements vscode.Disposable {
  readonly controller = vscode.tests.createTestController("wmpy", "WM Keyboard plugins");
  private readonly disposables: vscode.Disposable[] = [this.controller];

  constructor(
    private readonly plugins: PluginIndex,
    private readonly exe: () => Promise<string | undefined>,
    private readonly log: vscode.LogOutputChannel,
  ) {
    this.controller.resolveHandler = async (item) => {
      if (!item) await this.discoverAll();
      else if (item.uri && !item.children.size) await this.discoverFile(item);
    };
    this.controller.refreshHandler = () => this.discoverAll();
    this.controller.createRunProfile(
      "Run",
      vscode.TestRunProfileKind.Run,
      async (request, token) => {
        await this.run(request, token);
      },
      true,
    );
    const watcher = vscode.workspace.createFileSystemWatcher("**/*.py");
    this.disposables.push(
      watcher,
      watcher.onDidCreate((uri) => void this.fileChanged(uri)),
      watcher.onDidChange((uri) => void this.fileChanged(uri)),
      watcher.onDidDelete((uri) => this.fileDeleted(uri)),
      plugins.onDidChange(() => void this.discoverAll()),
    );
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }

  private rootItem(root: string): vscode.TestItem {
    let item = this.controller.items.get(root);
    if (!item) {
      item = this.controller.createTestItem(root, this.plugins.label(root), vscode.Uri.file(root));
      item.canResolveChildren = true;
      this.controller.items.add(item);
    }
    return item;
  }

  private fileItem(root: string, rel: string): vscode.TestItem {
    const parent = this.rootItem(root);
    const id = `${root}::${rel}`;
    let item = parent.children.get(id);
    if (!item) {
      item = this.controller.createTestItem(id, rel, vscode.Uri.file(path.join(root, rel)));
      item.canResolveChildren = true;
      parent.children.add(item);
    }
    return item;
  }

  private functionItem(file: vscode.TestItem, name: string, line?: number): vscode.TestItem {
    const id = `${file.id}::${name}`;
    let item = file.children.get(id);
    if (!item) {
      item = this.controller.createTestItem(id, name, file.uri);
      file.children.add(item);
    }
    if (line !== undefined) item.range = new vscode.Range(line, 0, line, 0);
    return item;
  }

  async discoverAll(): Promise<void> {
    const roots = new Set(this.plugins.roots());
    this.controller.items.forEach((item) => {
      if (!roots.has(item.id)) this.controller.items.delete(item.id);
    });
    for (const root of roots) {
      const item = this.rootItem(root);
      const files = await vscode.workspace.findFiles(new vscode.RelativePattern(vscode.Uri.file(root), PATTERN), "**/.wmpy/**");
      const seen = new Set<string>();
      for (const uri of files) {
        const rel = path.relative(root, uri.fsPath).split(path.sep).join("/");
        if (!isTestFile(rel) || this.plugins.rootFor(uri) !== root) continue;
        const file = this.fileItem(root, rel);
        seen.add(file.id);
        await this.discoverFile(file);
      }
      item.children.forEach((child) => {
        if (!seen.has(child.id)) item.children.delete(child.id);
      });
    }
  }

  private async discoverFile(file: vscode.TestItem): Promise<void> {
    if (!file.uri) return;
    let text: string;
    try {
      text = Buffer.from(await vscode.workspace.fs.readFile(file.uri)).toString("utf8");
    } catch {
      return;
    }
    const found = findTests(text);
    const names = new Set(found.map((t) => t.name));
    file.children.forEach((child) => {
      if (!names.has(child.label)) file.children.delete(child.id);
    });
    for (const t of found) this.functionItem(file, t.name, t.line);
  }

  private async fileChanged(uri: vscode.Uri): Promise<void> {
    const root = this.plugins.rootFor(uri);
    if (!root) return;
    const rel = path.relative(root, uri.fsPath).split(path.sep).join("/");
    if (!isTestFile(rel)) return;
    await this.discoverFile(this.fileItem(root, rel));
  }

  private fileDeleted(uri: vscode.Uri): void {
    const root = this.plugins.rootFor(uri);
    if (!root) return;
    const rel = path.relative(root, uri.fsPath).split(path.sep).join("/");
    this.controller.items.get(root)?.children.delete(`${root}::${rel}`);
  }

  /** Runs the tests of [root] (all, or those [filter] picks) as the Test Explorer would. */
  async runFor(root: string, filter?: string): Promise<TestReport | undefined> {
    await this.discoverAll();
    const rootItem = this.rootItem(root);
    let include: vscode.TestItem[] = [rootItem];
    if (filter) {
      const matches: vscode.TestItem[] = [];
      rootItem.children.forEach((file) => {
        if (file.label === filter) matches.push(file);
        file.children.forEach((fn) => {
          if (fn.label === filter) matches.push(fn);
        });
      });
      if (matches.length) include = matches;
    }
    const source = new vscode.CancellationTokenSource();
    try {
      return await this.run(new vscode.TestRunRequest(include), source.token, filter);
    } finally {
      source.dispose();
    }
  }

  private async run(request: vscode.TestRunRequest, token: vscode.CancellationToken, filter?: string): Promise<TestReport | undefined> {
    const testRun = this.controller.createTestRun(request);
    const byRoot = new Map<string, vscode.TestItem[]>();
    const include: vscode.TestItem[] = request.include ? [...request.include] : [];
    if (!request.include) this.controller.items.forEach((i) => include.push(i));
    for (const item of include) {
      const root = rootIdOf(item.id);
      byRoot.set(root, [...(byRoot.get(root) ?? []), item]);
    }
    let last: TestReport | undefined;
    try {
      const exe = await this.exe();
      if (!exe) {
        for (const item of include) testRun.errored(item, new vscode.TestMessage("The wmpy program was not found."));
        return undefined;
      }
      for (const [root, items] of byRoot) {
        if (token.isCancellationRequested) break;
        const functions = items.filter((i) => i.id.split("::").length === 3);
        const k = filter ?? (items.length === 1 && functions.length === 1 ? functions[0].label : undefined);
        const args = ["test", root, "--json", ...(k ? ["-k", k] : [])];
        for (const item of items) enqueue(testRun, item);
        this.log.info(`wmpy ${args.join(" ")}`);
        const ran = await run(exe, args, { cwd: root, onCancel: (kill) => token.onCancellationRequested(kill) });
        const report = parseJsonOutput<unknown>(ran.stdout);
        if (!isTestReport(report)) {
          const text = (ran.stderr || ran.stdout || `wmpy test exited with ${ran.code}`).trim();
          testRun.appendOutput(crlf(text + "\n"));
          for (const item of items) testRun.errored(item, new vscode.TestMessage(text));
          continue;
        }
        last = report;
        this.apply(testRun, root, items, report);
      }
      return last;
    } finally {
      testRun.end();
    }
  }

  /** Marks each test in [report] that falls under one of [items]. */
  private apply(testRun: vscode.TestRun, root: string, items: vscode.TestItem[], report: TestReport): void {
    const wanted = (id: string) => items.some((i) => id === i.id || id.startsWith(i.id + "::"));
    for (const t of report.tests) {
      const item = this.itemFor(root, t);
      if (!wanted(item.id)) continue;
      if (t.output) testRun.appendOutput(crlf(t.output), undefined, item);
      if (t.ok) {
        testRun.passed(item, t.durationMs);
      } else {
        const message = new vscode.TestMessage(t.error ? failureText(t.error) : "failed");
        const line = t.error?.line;
        if (t.error && line) {
          const file = t.error.file ? (path.isAbsolute(t.error.file) ? t.error.file : path.join(root, t.error.file)) : path.join(root, t.file);
          const pos = new vscode.Position(Math.max(0, line - 1), Math.max(0, (t.error.col ?? 1) - 1));
          message.location = new vscode.Location(vscode.Uri.file(file), pos);
        }
        testRun.failed(item, message, t.durationMs);
      }
    }
  }

  private itemFor(root: string, t: TestResult): vscode.TestItem {
    const rel = (path.isAbsolute(t.file) ? path.relative(root, t.file) : t.file).split(path.sep).join("/");
    const file = this.fileItem(root, rel || "test.py");
    if (!t.name || t.name === rel || t.name === "<module>") return file;
    return this.functionItem(file, t.name);
  }
}

function rootIdOf(id: string): string {
  const i = id.indexOf("::");
  return i < 0 ? id : id.slice(0, i);
}

function enqueue(testRun: vscode.TestRun, item: vscode.TestItem): void {
  testRun.enqueued(item);
  item.children.forEach((c) => enqueue(testRun, c));
}
