/**
 * lib/python.ts — bridge to the Python op layer (Design Docs/FrontendDesign.md §9.1).
 *
 * Spawns `python -m webapi.ops <command> --json '<payload>'` from the repo root, parses
 * the single JSON object it prints to stdout, and surfaces stderr-JSON failures as typed
 * errors. Complex writes (resolve/override/save/delete/export) route through here so no
 * business logic is duplicated in TS (decision Q9).
 */
import { spawn } from "node:child_process";
import path from "node:path";

const REPO_ROOT = process.env.SPREADX_ROOT ?? path.join(process.cwd(), "..");
const PYTHON =
  process.env.SPREADX_PYTHON ??
  path.join(REPO_ROOT, ".venv", "Scripts", "python.exe");

export interface OpError extends Error {
  type?: string;
}

/** Run a synchronous op and resolve with its parsed JSON result. */
export function runOp<T = unknown>(
  command: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const child = spawn(
      PYTHON,
      ["-m", "webapi.ops", command, "--json", JSON.stringify(payload)],
      { cwd: REPO_ROOT, windowsHide: true }
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout) as T);
        } catch {
          reject(
            new Error(`op '${command}': invalid JSON on stdout: ${stdout.slice(0, 200)}`)
          );
        }
        return;
      }
      // Failure: stderr should carry {error, type}.
      try {
        const j = JSON.parse(stderr) as { error?: string; type?: string };
        const err: OpError = new Error(j.error ?? `op '${command}' exited ${code}`);
        err.type = j.type;
        reject(err);
      } catch {
        reject(new Error(stderr.trim() || `op '${command}' exited with code ${code}`));
      }
    });
  });
}

/**
 * Fire-and-forget a long-running op (the upload pipeline). Spawns detached + unref'd so
 * the request returns immediately; the op records progress/errors in the DB and the
 * frontend polls status.
 */
export function runDetached(command: string, payload: Record<string, unknown>): void {
  const child = spawn(
    PYTHON,
    ["-m", "webapi.ops", command, "--json", JSON.stringify(payload)],
    { cwd: REPO_ROOT, detached: true, stdio: "ignore", windowsHide: true }
  );
  child.unref();
}
