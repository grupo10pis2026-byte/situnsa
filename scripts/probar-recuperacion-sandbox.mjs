/**
 * Ejecutar con node scripts/probar-recuperacion-sandbox.mjs y supervisor activo sin trabajos pendientes.
 * Interrumpe/reinicia ese supervisor y comprueba recuperación del flujo /api/documentos/:id/analisis.
 */
/** Prueba de mantenimiento local: reinicia el supervisor y crea un huérfano sintético. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { docker, LABEL, sandboxArgs } from "./pdf-sandbox-runtime.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = resolve(repo, "../docker-volumes/grupo10-proyecto/sandbox");
const queue = join(base, "queue");
const staging = join(base, "staging");
assert.equal(
  (await readdir(queue)).filter((entry) => entry !== "heartbeat").length,
  0,
  "Ejecutar recuperación solo sin trabajos pendientes",
);
assert.equal((await docker(["ps", "-aq", "--filter", `label=${LABEL}`])).trim(), "");
const pid = Number(await readFile(join(base, "supervisor.lock"), "utf8"));
assert(Number.isSafeInteger(pid) && pid > 0);
process.kill(pid, "SIGTERM");
await delay(500);
const fixture = join(base, "recovery.pdf");
await writeFile(fixture, "%PDF-1.7\nfixture de recuperacion");
const name = `pis-pdf-${randomUUID()}`;
const image = (
  await docker(["image", "inspect", "grupo10-pdf-sandbox:local", "--format", "{{.Id}}"])
).trim();
const args = sandboxArgs(name, image, fixture);
args.splice(args.length - 1, 0, "--entrypoint", "node");
args.push("-e", "setInterval(()=>{},1000);");
await docker(args);
await docker(["start", name]);
const orphanCopy = join(staging, "job-orphanQA");
await mkdir(orphanCopy);
await writeFile(join(orphanCopy, "document.pdf"), "%PDF-1.7\nfixture");
const stale = join(queue, randomUUID());
const partial = join(queue, randomUUID());
await mkdir(stale);
await mkdir(partial);
await writeFile(
  join(stale, "request.json"),
  JSON.stringify({ id: stale.split(/[\\/]/u).at(-1), createdAt: 0 }),
);
await writeFile(join(partial, "request.tmp"), "{}");
await utimes(partial, new Date(0), new Date(0));
await rm(join(queue, "heartbeat"), { force: true });
const out = await open(join(repo, "var/qa/sandbox-supervisor.log"), "a");
const err = await open(join(repo, "var/qa/sandbox-supervisor-error.log"), "a");
const supervisor = spawn(process.execPath, [join(repo, "scripts/pdf-sandbox-supervisor.mjs")], {
  cwd: repo,
  detached: true,
  windowsHide: true,
  stdio: ["ignore", out.fd, err.fd],
});
supervisor.unref();
await out.close();
await err.close();
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    await delay(100);
    if ((await readdir(queue)).length === 1 && (await readdir(staging)).length === 0) break;
  }
  assert.deepEqual(await readdir(queue), ["heartbeat"]);
  assert.deepEqual(await readdir(staging), []);
  assert.equal((await docker(["ps", "-aq", "--filter", `label=${LABEL}`])).trim(), "");
  assert.equal(Number(await readFile(join(base, "supervisor.lock"), "utf8")), supervisor.pid);
  console.log(
    JSON.stringify({
      passed: true,
      staleQueueRemoved: true,
      orphanContainerRemoved: true,
      stagingClean: true,
      supervisorPid: supervisor.pid,
    }),
  );
} finally {
  await docker(["rm", "--force", name]).catch(() => {});
  await rm(fixture, { force: true });
}
