import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdtemp, open, realpath, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

export const LABEL = "pis.pdf-sandbox=grupo10";
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

/** Sin shell; límites de stdout/stderr y duración también para el cliente Docker. */
export function docker(args, { timeout = 20_000, maxOutput = 600_000, signal } = {}) {
  return new Promise((accept, reject) => {
    if (signal?.aborted) return reject(new Error("DOCKER_CANCELLED"));
    const child = spawn("docker", args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let stdout = "";
    let stderr = "";
    let error;
    const abort = () => {
      error = new Error("DOCKER_CANCELLED");
      child.kill();
    };
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => {
      error = new Error("DOCKER_TIMEOUT");
      child.kill();
    }, timeout);
    const consume = (chunk, stream) => {
      if (stream === "stdout") stdout += chunk.toString();
      else stderr += chunk.toString();
      if (stdout.length + stderr.length > maxOutput) {
        error = new Error("DOCKER_OUTPUT_LIMIT");
        child.kill();
      }
    };
    child.stdout.on("data", (chunk) => consume(chunk, "stdout"));
    child.stderr.on("data", (chunk) => consume(chunk, "stderr"));
    child.on("error", (err) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else if (code !== 0) reject(new Error(`DOCKER_EXIT_${code}`));
      else accept(stdout);
    });
  });
}

export function sandboxArgs(name, image, pdf) {
  if (!/^pis-pdf-[a-f0-9-]+$/u.test(name) || !/^sha256:[a-f0-9]{64}$/u.test(image))
    throw new Error("CONFIG_INVALIDA");
  if (pdf.includes(",")) throw new Error("CONFIG_INVALIDA");
  return [
    "create",
    "--name",
    name,
    "--label",
    LABEL,
    "--network",
    "none",
    "--read-only",
    "--user",
    "1000:1000",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges=true",
    "--memory",
    "256m",
    "--memory-swap",
    "256m",
    "--cpus",
    "1",
    "--pids-limit",
    "32",
    "--ulimit",
    "nofile=128:128",
    "--init",
    "--log-driver",
    "none",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777",
    "--mount",
    `type=bind,source=${pdf},target=/input/document.pdf,readonly`,
    image,
  ];
}

/** Rechaza junctions/symlinks y copia por descriptor a staging privado del host. */
export async function snapshot(queue, id, staging) {
  if (!UUID.test(id)) throw new Error("TRABAJO_INVALIDO");
  const root = await realpath(queue);
  const dir = join(root, id);
  if (!(await lstat(dir)).isDirectory() || (await lstat(dir)).isSymbolicLink())
    throw new Error("TRABAJO_INVALIDO");
  if (relative(root, await realpath(dir)) !== id) throw new Error("TRABAJO_INVALIDO");
  const source = join(dir, "document.pdf");
  if ((await lstat(source)).isSymbolicLink() || (await realpath(source)) !== resolve(source))
    throw new Error("TRABAJO_INVALIDO");
  const input = await open(source, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let privateDir;
  try {
    const size = (await input.stat()).size;
    if (!(await input.stat()).isFile() || size < 8 || size > 50 * 1024 * 1024)
      throw new Error("TRABAJO_INVALIDO");
    privateDir = await mkdtemp(join(staging, "job-"));
    const pdf = join(privateDir, "document.pdf");
    const output = await open(pdf, "wx", 0o644);
    try {
      const chunk = Buffer.alloc(64 * 1024);
      let offset = 0;
      while (offset < size) {
        const { bytesRead } = await input.read(
          chunk,
          0,
          Math.min(chunk.length, size - offset),
          offset,
        );
        if (!bytesRead) throw new Error("TRABAJO_INVALIDO");
        if (offset === 0 && chunk.subarray(0, 5).toString() !== "%PDF-")
          throw new Error("TRABAJO_INVALIDO");
        await output.write(chunk.subarray(0, bytesRead));
        offset += bytesRead;
      }
    } finally {
      await output.close();
    }
    await chmod(pdf, 0o444);
    return { dir: privateDir, pdf };
  } catch (err) {
    if (privateDir) await rm(privateDir, { recursive: true, force: true });
    throw err;
  } finally {
    await input.close();
  }
}

export async function runSandbox(image, pdf, { timeout = 20_000, command = [], signal } = {}) {
  const name = `pis-pdf-${randomUUID()}`;
  const deadline = Date.now() + timeout;
  try {
    const args = sandboxArgs(name, image, pdf);
    // Solo las pruebas locales pueden sustituir el comando; la cola nunca lo acepta.
    if (command.length) {
      args.splice(args.length - 1, 0, "--entrypoint", "node");
      args.push(...command);
    }
    await docker(args, { timeout: Math.max(1, deadline - Date.now()), signal });
    return await docker(["start", "--attach", name], {
      timeout: Math.max(1, deadline - Date.now()),
      signal,
    });
  } finally {
    // rm -f termina también todos los procesos descendientes del contenedor.
    await removeSandbox(name);
  }
}

async function removeSandbox(name) {
  try {
    await docker(["rm", "--force", name], { timeout: 10_000 });
  } catch {
    const remaining = await docker(["ps", "-aq", "--filter", `name=^/${name}$`]);
    if (remaining.trim()) throw new Error("SANDBOX_CLEANUP_FAILED");
  }
}
