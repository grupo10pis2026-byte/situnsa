/**
 * Ejecutable del host: node scripts/pdf-sandbox-supervisor.mjs [directorio-sandbox].
 * Consume queue/ de cola-sandbox.ts para POST /api/documentos/:id/analisis; usa pdf-sandbox-runtime.mjs.
 * No escucha puertos; protege staging privado, fija imagen y recupera trabajos huérfanos.
 */
import {
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { docker, LABEL, runSandbox, snapshot, UUID } from "./pdf-sandbox-runtime.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = resolve(process.argv[2] ?? join(repo, "../docker-volumes/grupo10-proyecto/sandbox"));
const queue = join(base, "queue");
const staging = join(base, "staging");
await mkdir(queue, { recursive: true });
await mkdir(staging, { recursive: true, mode: 0o700 });
if ((await lstat(base)).isSymbolicLink() || (await realpath(base)) !== base)
  throw new Error("RAIZ_INVALIDA");
const lockPath = join(base, "supervisor.lock");
try {
  const pid = Number(await readFile(lockPath, "utf8"));
  if (!Number.isInteger(pid) || pid <= 0) throw new Error("LOCK_INVALIDO");
  try {
    process.kill(pid, 0);
    throw new Error("SUPERVISOR_ACTIVO");
  } catch (err) {
    if (err.code !== "ESRCH") throw err;
  }
  await rm(lockPath);
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}
const lock = await open(lockPath, "wx", 0o600);
await lock.writeFile(String(process.pid));
await lock.close();
const stopPath = join(base, "stop");
await rm(stopPath, { force: true });
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
let beat;
try {
  // Fijar ID local: un trabajo no puede cambiar imagen, flags o comandos Docker.
  const image = (
    await docker(["image", "inspect", "grupo10-pdf-sandbox:local", "--format", "{{.Id}}"])
  ).trim();
  const orphans = (await docker(["ps", "-aq", "--filter", `label=${LABEL}`]))
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  for (const id of orphans) await docker(["rm", "--force", id]);
  for (const entry of await readdir(staging)) {
    if (/^job-[a-zA-Z0-9]+$/u.test(entry))
      await rm(join(staging, entry), { recursive: true, force: true });
  }
  await writeFile(join(queue, "heartbeat"), "ready");
  beat = setInterval(() => {
    void writeFile(join(queue, "heartbeat"), "ready").catch(() => {
      stopping = true;
    });
  }, 500);
  console.log(JSON.stringify({ status: "ready", pid: process.pid, image }));
  while (!stopping) {
    try {
      await lstat(stopPath);
      stopping = true;
      break;
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    const jobs = (await readdir(queue)).filter((id) => UUID.test(id));
    for (const id of jobs.slice(0, 32)) {
      if (stopping) break;
      const dir = join(queue, id);
      let copy;
      let cancelMonitor;
      try {
        if ((await lstat(dir)).isSymbolicLink() || (await realpath(dir)) !== dir) continue;
        if (Date.now() - (await lstat(dir)).mtimeMs > 60_000) {
          await rm(dir, { recursive: true, force: true });
          continue;
        }
        const requestPath = join(dir, "request.json");
        const info = await lstat(requestPath);
        if (info.isSymbolicLink() || !info.isFile() || info.size > 256) continue;
        const request = JSON.parse(await readFile(requestPath, "utf8"));
        if (
          request.id !== id ||
          !Number.isSafeInteger(request.createdAt) ||
          Date.now() - request.createdAt > 30_000 ||
          request.createdAt > Date.now() + 1_000
        ) {
          await rm(dir, { recursive: true, force: true });
          continue;
        }
        try {
          await lstat(join(dir, "result.json"));
          continue;
        } catch (err) {
          if (err.code !== "ENOENT") throw err;
        }
        copy = await snapshot(queue, id, staging);
        const controller = new AbortController();
        cancelMonitor = setInterval(() => {
          if (stopping) controller.abort();
          void lstat(dir).catch(() => controller.abort());
          void lstat(stopPath)
            .then(() => {
              stopping = true;
              controller.abort();
            })
            .catch(() => {});
        }, 100);
        const result = await runSandbox(image, copy.pdf, { signal: controller.signal });
        JSON.parse(result);
        await writeFile(join(dir, "result.tmp"), result, { flag: "wx" });
        await rename(join(dir, "result.tmp"), join(dir, "result.json"));
      } catch (err) {
        if (err.message === "SANDBOX_CLEANUP_FAILED") stopping = true;
        if (err.code !== "ENOENT") {
          console.error(JSON.stringify({ id, error: "PDF_NO_EVALUABLE" }));
          // No seguir symlinks al publicar resultados, ni exponer texto del PDF.
          try {
            if (!(await lstat(dir)).isSymbolicLink() && (await realpath(dir)) === dir) {
              await writeFile(join(dir, "result.tmp"), '{"error":"PDF_NO_EVALUABLE"}', {
                flag: "wx",
              });
              await rename(join(dir, "result.tmp"), join(dir, "result.json"));
            }
          } catch {
            /* El cliente pudo cancelar y retirar el directorio. */
          }
        }
      } finally {
        clearInterval(cancelMonitor);
        if (copy) await rm(copy.dir, { recursive: true, force: true });
      }
    }
    await delay(100);
  }
} finally {
  clearInterval(beat);
  await rm(join(queue, "heartbeat"), { force: true });
  await rm(lockPath, { force: true });
  await rm(stopPath, { force: true });
}
