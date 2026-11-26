// The wmpy language server (`wmpy lsp`), started for the Python files of the
// workspace's plugin folders and for their plugin.json.

import * as vscode from "vscode";
import {
  ExecuteCommandRequest,
  LanguageClient,
  LanguageClientOptions,
  RevealOutputChannelOn,
  ServerOptions,
  State,
} from "vscode-languageclient/node";

/** What the client does with the server's commands, when a code lens runs one. */
export interface CommandHandlers {
  /** `wmpy.preview`: the server started a preview and answered with its address. */
  preview(root: string, url: string): void | Promise<void>;
  /** `wmpy.test`: run through the Test Explorer instead, so results show there. */
  test(root: string, filter: string | undefined): Promise<unknown>;
  /** `wmpy.run`: the command line to open in a terminal. */
  run(root: string, command: string[]): void;
}

export type ServerState = "stopped" | "starting" | "running" | "failed";

export class Server implements vscode.Disposable {
  private client: LanguageClient | undefined;
  private watchers: vscode.FileSystemWatcher[] = [];
  private readonly stateChanged = new vscode.EventEmitter<ServerState>();
  readonly onDidChangeState = this.stateChanged.event;
  state: ServerState = "stopped";

  constructor(
    private readonly log: vscode.LogOutputChannel,
    private readonly handlers: CommandHandlers,
  ) {}

  private setState(s: ServerState): void {
    this.state = s;
    this.stateChanged.fire(s);
  }

  get running(): boolean {
    return this.client?.state === State.Running;
  }

  /** Starts (or restarts) the server for [roots]; with no roots it stays stopped. */
  async start(exe: string, roots: readonly string[]): Promise<void> {
    await this.stop();
    if (roots.length === 0) return;
    const serverOptions: ServerOptions = {
      run: { command: exe, args: ["lsp"] },
      debug: { command: exe, args: ["lsp"] },
    };
    // Protocol-style relative patterns, which the client turns into
    // vscode.RelativePattern: only the plugin folders, not every Python file.
    const documentSelector = roots.flatMap((root) => {
      const baseUri = vscode.Uri.file(root).toString();
      return [
        { scheme: "file", language: "python", pattern: { baseUri, pattern: "**/*.py" } },
        { scheme: "file", pattern: { baseUri, pattern: "plugin.json" } },
      ];
    });
    this.watchers = roots.map((root) =>
      vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(root), "**/*.{py,json}")),
    );
    const clientOptions: LanguageClientOptions = {
      documentSelector,
      outputChannel: this.log,
      revealOutputChannelOn: RevealOutputChannelOn.Never,
      initializationOptions: { preview: "client" },
      synchronize: { fileEvents: this.watchers },
      middleware: {
        executeCommand: async (command, args, next) => {
          const root = rootOf(args);
          switch (command) {
            case "wmpy.test":
              if (root) return this.handlers.test(root, typeof args[1] === "string" ? args[1] : undefined);
              break;
            case "wmpy.preview": {
              const result = (await next(command, args)) as { url?: string } | undefined;
              if (root && result?.url) await this.handlers.preview(root, result.url);
              return result;
            }
            case "wmpy.run": {
              const result = (await next(command, args)) as { command?: string[] } | undefined;
              if (root && result?.command?.length) this.handlers.run(root, result.command);
              return result;
            }
          }
          return next(command, args);
        },
      },
    };
    this.client = new LanguageClient("wmpy", "wmpy language server", serverOptions, clientOptions);
    this.client.onDidChangeState((e) => {
      if (e.newState === State.Running) this.setState("running");
      else if (e.newState === State.Starting) this.setState("starting");
      else if (this.state !== "failed") this.setState("stopped");
    });
    this.setState("starting");
    try {
      await this.client.start();
    } catch (e) {
      this.log.error(`The wmpy language server did not start: ${String(e)}`);
      this.setState("failed");
    }
  }

  async stop(): Promise<void> {
    const c = this.client;
    this.client = undefined;
    if (c) {
      try {
        await c.stop();
      } catch {
        // already gone
      }
      await c.dispose();
    }
    for (const w of this.watchers) w.dispose();
    this.watchers = [];
    this.setState("stopped");
  }

  /** Runs a server command for the plugin in [root], or undefined when the server is not running. */
  async command(command: string, root: string, ...rest: unknown[]): Promise<unknown> {
    const c = this.client;
    if (!c || c.state !== State.Running) return undefined;
    const uri = c.code2ProtocolConverter.asUri(vscode.Uri.file(root));
    return c.sendRequest(ExecuteCommandRequest.type, { command, arguments: [uri, ...rest] });
  }

  dispose(): void {
    void this.stop();
    this.stateChanged.dispose();
  }
}

/** The plugin folder a server command names as its first argument, a URI. */
function rootOf(args: unknown[]): string | undefined {
  const first = args[0];
  if (typeof first !== "string" || !first) return undefined;
  try {
    return first.includes("://") ? vscode.Uri.parse(first).fsPath : first;
  } catch {
    return undefined;
  }
}
