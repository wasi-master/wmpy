// A stand-in for the wmpy program in the integration test: answers
// --version, test --json, preview --print-url and a small language server,
// and logs every call to $WMPY_FAKE_LOG.

import * as fs from "node:fs";
import * as http from "node:http";

const log = (line: string) => {
  if (process.env.WMPY_FAKE_LOG) fs.appendFileSync(process.env.WMPY_FAKE_LOG, line + "\n");
};
const args = process.argv.slice(2);
log(`argv ${args.join(" ")}`);

function serve(onUrl: (url: string) => void): void {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<!doctype html><title>fake preview</title><p id=ok>fake preview</p>");
  });
  server.listen(0, "127.0.0.1", () => {
    const port = (server.address() as { port: number }).port;
    onUrl(`http://127.0.0.1:${port}/?t=faketoken`);
  });
}

function lsp(): void {
  let buffer = Buffer.alloc(0);
  const send = (msg: object) => {
    const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...msg }), "utf8");
    process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
    process.stdout.write(body);
  };
  const handle = (m: { id?: number; method?: string; params?: any }) => {
    log(`lsp ${m.method}${m.method === "workspace/executeCommand" ? " " + m.params.command : ""}`);
    switch (m.method) {
      case "initialize":
        log(`init ${JSON.stringify(m.params.initializationOptions)}`);
        return send({
          id: m.id,
          result: {
            capabilities: {
              textDocumentSync: 1,
              codeLensProvider: {},
              executeCommandProvider: { commands: ["wmpy.preview", "wmpy.test", "wmpy.check", "wmpy.pack", "wmpy.run"] },
            },
            serverInfo: { name: "fake wmpy", version: "0.0.0" },
          },
        });
      case "textDocument/codeLens":
        return send({ id: m.id, result: [] });
      case "workspace/executeCommand": {
        const [folder] = m.params.arguments ?? [];
        switch (m.params.command) {
          case "wmpy.preview":
            return serve((url) => send({ id: m.id, result: { url } }));
          case "wmpy.check":
            return send({ id: m.id, result: { errors: 0, warnings: 0, infos: 0, files: 1 } });
          case "wmpy.pack":
            return send({ id: m.id, result: { path: "/tmp/x.wmplugin", sha256: "0".repeat(64), size: 2048 } });
          case "wmpy.run":
            return send({ id: m.id, result: { command: [process.execPath, "-e", "setTimeout(() => {}, 100)", folder] } });
        }
        return send({ id: m.id, result: null });
      }
      case "shutdown":
        return send({ id: m.id, result: null });
      case "exit":
        process.exit(0);
    }
    if (m.id !== undefined && m.method) send({ id: m.id, result: null });
  };
  process.stdin.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const end = buffer.indexOf("\r\n\r\n");
      if (end < 0) return;
      const length = Number(/Content-Length: (\d+)/i.exec(buffer.subarray(0, end).toString())?.[1]);
      if (buffer.length < end + 4 + length) return;
      const body = buffer.subarray(end + 4, end + 4 + length).toString("utf8");
      buffer = buffer.subarray(end + 4 + length);
      handle(JSON.parse(body));
    }
  });
}

switch (args[0]) {
  case "--version":
    console.log("wmpy 0.0.0-fake (wm-python 0, plugin API 5)");
    break;
  case "lsp":
    lsp();
    break;
  case "preview":
    serve((url) => console.log(JSON.stringify({ url, port: Number(new URL(url).port) })));
    break;
  case "test": {
    const k = args.indexOf("-k") >= 0 ? args[args.indexOf("-k") + 1] : undefined;
    const tests = [
      { file: "test.py", name: "test_upper", ok: true, durationMs: 1, output: "checked upper\n", error: null },
      {
        file: "test.py",
        name: "test_lower",
        ok: false,
        durationMs: 2,
        output: "",
        error: { severity: "error", code: "AssertionError", message: "lower broke", file: "test.py", line: 5, col: 5, endCol: 11, traceback: null, notes: [], help: null },
      },
    ].filter((t) => !k || t.name === k);
    const failed = tests.filter((t) => !t.ok).length;
    console.log(JSON.stringify({ ok: failed === 0, passed: tests.length - failed, failed, durationMs: 3, tests }));
    process.exitCode = failed ? 1 : 0;
    break;
  }
  case "check":
    console.log(JSON.stringify({ ok: true, errors: 0, warnings: 0, problems: [] }));
    break;
  default:
    console.error(`fake wmpy: ${args.join(" ")}`);
    process.exitCode = 2;
}
