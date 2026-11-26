// Running wmpy as a child process. No vscode import.

import { spawn } from "node:child_process";

export interface Ran {
  /** The exit code, or -1 when the process could not start or was killed. */
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  cwd?: string;
  /** Called when the run should stop; the process is killed. */
  onCancel?: (kill: () => void) => void;
  /** Streamed stdout and stderr, as they arrive. */
  onOutput?: (chunk: string) => void;
}

/** Runs [exe] with [args] to the end and collects what it printed. */
export function run(exe: string, args: readonly string[], options: RunOptions = {}): Promise<Ran> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let child;
    try {
      child = spawn(exe, args, { cwd: options.cwd, shell: false, windowsHide: true });
    } catch (e) {
      resolve({ code: -1, stdout: "", stderr: String(e) });
      return;
    }
    options.onCancel?.(() => child.kill());
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d: string) => {
      stdout += d;
      options.onOutput?.(d);
    });
    child.stderr.on("data", (d: string) => {
      stderr += d;
      options.onOutput?.(d);
    });
    child.on("error", (e) => resolve({ code: -1, stdout, stderr: stderr + String(e) }));
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

export interface Started {
  /** The first line the process printed on stdout. */
  line: string;
  kill: () => void;
}

/**
 * Starts a process that keeps running, such as `wmpy preview --print-url`,
 * and resolves with its first stdout line. Rejects if it exits first or
 * prints nothing within [timeoutMs].
 */
export function startForLine(exe: string, args: readonly string[], cwd?: string, timeoutMs = 20000): Promise<Started> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd, shell: false, windowsHide: true });
    let buffer = "";
    let stderr = "";
    let done = false;
    const finish = (err?: Error, line?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err) {
        child.kill();
        reject(err);
      } else {
        resolve({ line: line ?? "", kill: () => child.kill() });
      }
    };
    const timer = setTimeout(() => finish(new Error(`${exe} printed nothing for ${timeoutMs / 1000} s`)), timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d: string) => {
      buffer += d;
      const nl = buffer.indexOf("\n");
      if (nl >= 0) finish(undefined, buffer.slice(0, nl).trim());
    });
    child.stderr.on("data", (d: string) => (stderr += d));
    child.on("error", (e) => finish(e));
    child.on("close", (code) => finish(new Error(stderr.trim() || `${exe} exited with ${code}`)));
  });
}
