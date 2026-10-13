/** Pruebas de integración del aislamiento real; solo fixtures sintéticas. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { docker, LABEL, runSandbox, sandboxArgs, snapshot } from "./pdf-sandbox-runtime.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(repo, "../docker-volumes/grupo10-proyecto/sandbox");
await mkdir(join(root, "qa"), { recursive: true });
const dir = await mkdtemp(join(root, "qa/test-"));
const image = (
  await docker(["image", "inspect", "grupo10-pdf-sandbox:local", "--format", "{{.Id}}"])
).trim();
const requireApi = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { PDFDocument, StandardFonts } = requireApi("pdf-lib");
const evidence = [];
async function check(name, test) {
  const start = performance.now();
  await test();
  const result = { name, passed: true, ms: Math.round(performance.now() - start) };
  evidence.push(result);
  console.log(JSON.stringify(result));
}
try {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 4; i++)
    pdf.addPage().drawText(i === 4 ? "SOLO_PAGINA_4" : `Pagina ${i}`, { font, x: 50, y: 700 });
  const file = join(dir, "document.pdf");
  await writeFile(file, await pdf.save());
  await check("extrae solo paginas 1-3", async () => {
    const result = JSON.parse(await runSandbox(image, file));
    assert.equal(result.totalPaginas, 4);
    assert.deepEqual(
      result.paginas.map((p) => p.numero),
      [1, 2, 3],
    );
    assert(!result.paginas.some((p) => p.texto.includes("SOLO_PAGINA_4")));
  });
  await check("configuracion Docker aplicada", async () => {
    const name = `pis-pdf-${randomUUID()}`;
    try {
      await docker(sandboxArgs(name, image, file));
      const [config] = JSON.parse(await docker(["inspect", name]));
      assert.equal(config.Config.User, "1000:1000");
      assert.equal(config.HostConfig.NetworkMode, "none");
      assert.equal(config.HostConfig.ReadonlyRootfs, true);
      assert.equal(config.HostConfig.Privileged, false);
      assert.equal(config.HostConfig.Memory, 256 * 1024 * 1024);
      assert.equal(config.HostConfig.MemorySwap, config.HostConfig.Memory);
      assert.equal(config.HostConfig.NanoCpus, 1_000_000_000);
      assert.equal(config.HostConfig.PidsLimit, 32);
      assert.deepEqual(config.HostConfig.CapDrop, ["ALL"]);
      assert(config.HostConfig.SecurityOpt.includes("no-new-privileges=true"));
      assert.equal(config.Mounts.length, 1);
      assert.equal(config.Mounts[0].RW, false);
      assert.equal(config.Mounts[0].Destination, "/input/document.pdf");
      assert(!config.Config.Env.some((e) => /GEMINI_API_KEY|DATABASE_URL|JWT_SECRET/u.test(e)));
    } finally {
      await docker(["rm", "--force", name]);
    }
  });
  await check("barreras efectivas de archivos, UID, seccomp y cgroups", async () => {
    const result = JSON.parse(
      await runSandbox(image, file, {
        command: [
          "-e",
          `
      const fs = require('node:fs');
      const status = fs.readFileSync('/proc/self/status','utf8');
      const denied = {};
      for (const p of ['/input/document.pdf','/app/escritura','/etc/escritura']) {
        try { fs.writeFileSync(p,'x'); denied[p] = false; } catch { denied[p] = true; }
      }
      for (const p of ['/var/run/docker.sock','/var/data/titulacion-docs','/var/data/pdf-sandbox-queue','/backups']) {
        try { fs.statSync(p); denied[p] = false; } catch { denied[p] = true; }
      }
      console.log(JSON.stringify({uid:process.getuid(),status,denied,
        memory:fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim(),
        cpu:fs.readFileSync('/sys/fs/cgroup/cpu.max','utf8').trim(),
        pids:fs.readFileSync('/sys/fs/cgroup/pids.max','utf8').trim()}));
    `,
        ],
      }),
    );
    assert.equal(result.uid, 1000);
    assert.match(result.status, /CapEff:\s+0+\n/u);
    assert.match(result.status, /NoNewPrivs:\s+1/u);
    assert.match(result.status, /Seccomp:\s+2/u);
    assert(Object.values(result.denied).every(Boolean));
    assert.equal(result.memory, String(256 * 1024 * 1024));
    assert.equal(result.pids, "32");
    const [quota, period] = result.cpu.split(" ").map(Number);
    assert.equal(quota / period, 1);
  });
  await check("sin red a Internet, host y Postgres", async () => {
    const result = JSON.parse(
      await runSandbox(image, file, {
        command: [
          "-e",
          `
      const net = require('node:net');
      const targets = [['1.1.1.1',443],['host.docker.internal',80],['postgres',5432]];
      Promise.all(targets.map(([host,port]) => new Promise(resolve => {
        const socket = net.connect({host,port});
        const done = value => { socket.destroy(); resolve(value); };
        socket.on('connect',()=>done(false)); socket.on('error',()=>done(true));
        socket.setTimeout(1500,()=>done(true));
      }))).then(result => console.log(JSON.stringify(result)));
    `,
        ],
      }),
    );
    assert.deepEqual(result, [true, true, true]);
  });
  await check("tmpfs limitado a 64 MiB", async () => {
    const output = await runSandbox(image, file, {
      command: [
        "-e",
        `
      const fs=require('node:fs');const fd=fs.openSync('/tmp/llenar','w');
      const chunk=Buffer.alloc(1024*1024);let written=0;
      try{for(let i=0;i<70;i++){fs.writeSync(fd,chunk);written++;}}catch(e){
        console.log(JSON.stringify({code:e.code,written}));}
      fs.closeSync(fd);
    `,
      ],
    });
    const result = JSON.parse(output);
    assert.equal(result.code, "ENOSPC");
    assert(result.written <= 64);
  });
  await check("memoria excesiva termina el trabajo", async () => {
    await assert.rejects(
      runSandbox(image, file, {
        command: ["-e", "const a=[];for(let i=0;i<500;i++)a.push(Buffer.alloc(1024*1024,1));"],
      }),
      /DOCKER_EXIT_/u,
    );
  });
  await check("limite de procesos efectivo sin fork bomb", async () => {
    const result = JSON.parse(
      await runSandbox(image, file, {
        command: [
          "-e",
          `
      const {spawn}=require('node:child_process');const children=[];let blocked=false;
      (async()=>{for(let i=0;i<40;i++){
        const child=spawn('/bin/sleep',['10']);children.push(child);
        await new Promise(resolve=>{child.once('spawn',resolve);child.once('error',e=>{blocked=e.code==='EAGAIN';resolve();});});
        if(blocked)break;
      } console.log(JSON.stringify({blocked,count:children.length}));
      for(const child of children)child.kill('SIGKILL');})();
    `,
        ],
      }),
    );
    assert(result.blocked);
    assert(result.count < 32);
  });
  await check("timeout mata descendientes y elimina contenedor", async () => {
    await assert.rejects(
      runSandbox(image, file, {
        timeout: 2_000,
        command: [
          "-e",
          "require('node:child_process').spawn('/bin/sleep',['60']);setInterval(()=>{},1000);",
        ],
      }),
      /DOCKER_TIMEOUT/u,
    );
    assert.equal((await docker(["ps", "-aq", "--filter", `label=${LABEL}`])).trim(), "");
  });
  await check("PDF falso falla sin salida de datos internos", async () => {
    const bad = join(dir, "bad.pdf");
    await writeFile(bad, "%PDF-1.7\nno es un PDF valido");
    await assert.rejects(runSandbox(image, bad), /DOCKER_EXIT_/u);
  });
  await check("cancelacion mata trabajo y limpia el contenedor", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1_000);
    try {
      await assert.rejects(
        runSandbox(image, file, {
          signal: controller.signal,
          command: ["-e", "setInterval(()=>{},1000);"],
        }),
        /DOCKER_CANCELLED/u,
      );
      assert.equal((await docker(["ps", "-aq", "--filter", `label=${LABEL}`])).trim(), "");
    } finally {
      clearTimeout(timer);
    }
  });
  await check("salida excesiva detiene el trabajo", async () => {
    await assert.rejects(
      runSandbox(image, file, { command: ["-e", "process.stdout.write('x'.repeat(700000));"] }),
      /DOCKER_OUTPUT_LIMIT/u,
    );
  });
  await check("supervisor rechaza traversal y firma falsa", async () => {
    const queue = join(dir, "queue");
    const staging = join(dir, "staging");
    await mkdir(queue);
    await mkdir(staging);
    await assert.rejects(snapshot(queue, "../otro", staging), /TRABAJO_INVALIDO/u);
    const id = randomUUID();
    await mkdir(join(queue, id));
    await writeFile(join(queue, id, "document.pdf"), "NO ES PDF");
    await assert.rejects(snapshot(queue, id, staging), /TRABAJO_INVALIDO/u);
  });
  await mkdir(join(repo, "var/qa"), { recursive: true });
  await writeFile(
    join(repo, "var/qa/sandbox-resultados.json"),
    JSON.stringify({ at: new Date().toISOString(), image, tests: evidence }, null, 2),
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
