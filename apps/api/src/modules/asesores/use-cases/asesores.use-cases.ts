import { randomUUID } from "node:crypto";
import type { AsesorDTO, PerfilAsesorDTO } from "@pis/contracts";
import {
  asesorArchivos,
  asesorEspecialidades,
  type DbExecutor,
  db,
  especialidades,
  roles,
  usuarios,
  usuariosRoles,
} from "@pis/db";
import {
  DomainError,
  FORMATOS_ARCHIVO_ASESOR,
  fail,
  MAX_MB_ARCHIVO_ASESOR,
  ok,
  puedeDesactivarAsesor,
  type Result,
  validarArchivo,
  validarDatosAsesor,
  validarNombreEspecialidad,
} from "@pis/domain";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { DrizzleUnitOfWork } from "../../../infra/db/unit-of-work.js";
import type { AlmacenamientoPort } from "../../../infra/storage/almacenamiento.port.js";
import { EmitirAccesoUseCase } from "../../auth/use-cases/acceso/emitir-acceso.use-case.js";
import { buscarEspecialidadPorNombre } from "../../taller-config/taller-config.repository.js";
import { asesorPorId, perfilAsesor } from "../asesores.repository.js";

/**
 * Casos de uso de P15 (lista de asesores) y P10 (perfil). Validan con el
 * dominio antes de abrir la transacción; los correos salen tras el commit.
 * Nada con historial se borra: el asesor se desactiva y el archivo se marca
 * como eliminado.
 */

export interface Actor {
  id: string;
  dni: string;
}

const noEncontrado = () => fail(new DomainError("NO_ENCONTRADO", "Asesor no encontrado"));
const duplicado = (m: string) => fail(new DomainError("DATOS_DUPLICADOS", m));

function idActor(actor: Actor): string | null {
  return actor.id === "" ? null : actor.id;
}

function registrar(actor: Actor, accion: string): void {
  console.log(JSON.stringify({ canal: "auditoria-asesores", actor: actor.dni, accion }));
}

async function esAsesor(tx: DbExecutor, id: string): Promise<boolean> {
  const filas = await tx
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(eq(usuarios.id, id), eq(usuarios.rol, "ASESOR")))
    .limit(1);
  return filas[0] !== undefined;
}

/**
 * Busca la especialidad por nombre o la agrega al catálogo (lista ampliable,
 * spec P10). Una especialidad desactivada en Configuración no se reutiliza.
 */
async function especialidadParaAsignar(
  tx: DbExecutor,
  nombre: string,
  actor: Actor,
): Promise<Result<string, DomainError>> {
  const existente = await buscarEspecialidadPorNombre(tx, nombre);
  if (existente) {
    if (!existente.activa)
      return fail(
        new DomainError(
          "REQUISITO_PENDIENTE",
          `La especialidad "${existente.nombre}" está desactivada; reactívala en Configuración`,
        ),
      );
    return ok(existente.id);
  }
  const [nueva] = await tx
    .insert(especialidades)
    .values({ nombre, creadoPor: idActor(actor) })
    .returning({ id: especialidades.id });
  if (!nueva)
    return fail(new DomainError("VALIDACION_FALLIDA", "No se pudo crear la especialidad"));
  return ok(nueva.id);
}

/** Nombres de especialidades válidos y sin repetir (sin distinguir mayúsculas). */
function nombresEspecialidades(nombres: readonly string[]): Result<string[], DomainError> {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const n of nombres) {
    const v = validarNombreEspecialidad(n);
    if (!v.ok) return v;
    const clave = v.value.toLowerCase();
    if (!vistos.has(clave)) {
      vistos.add(clave);
      out.push(v.value);
    }
  }
  return ok(out);
}

// ── P15 ────────────────────────────────────────────────────────────────

export interface NuevoAsesor {
  dni: string;
  nombres: string;
  apellidos: string;
  email: string;
  telefono?: string | null;
  grado?: string | null;
  especialidades?: string[];
}

export class CrearAsesorUseCase {
  constructor(private readonly emitirAcceso = new EmitirAccesoUseCase()) {}

  async execute(input: NuevoAsesor, actor: Actor): Promise<Result<AsesorDTO, DomainError>> {
    const v = validarDatosAsesor({
      ...input,
      telefono: input.telefono ?? null,
      grado: input.grado ?? null,
    });
    if (!v.ok) return v;
    const datos = v.value;
    const esp = nombresEspecialidades(input.especialidades ?? []);
    if (!esp.ok) return esp;

    const r = await new DrizzleUnitOfWork(db).run(
      async (tx): Promise<Result<string, DomainError>> => {
        const [porDni] = await tx
          .select({ nombres: usuarios.nombres, apellidos: usuarios.apellidos })
          .from(usuarios)
          .where(eq(usuarios.dni, datos.dni))
          .limit(1);
        if (porDni)
          return duplicado(
            `Ya existe un usuario con el DNI ${datos.dni} (${porDni.nombres} ${porDni.apellidos})`,
          );
        const [porCorreo] = await tx
          .select({ id: usuarios.id })
          .from(usuarios)
          .where(sql`lower(${usuarios.email}) = ${datos.email}`)
          .limit(1);
        if (porCorreo) return duplicado(`El correo ${datos.email} ya está registrado`);

        const [rolAsesor] = await tx
          .select({ id: roles.id })
          .from(roles)
          .where(eq(roles.nombre, "ASESOR"))
          .limit(1);
        if (!rolAsesor)
          return fail(new DomainError("NO_ENCONTRADO", "El rol ASESOR no está configurado"));

        const [creado] = await tx
          .insert(usuarios)
          .values({ ...datos, rol: "ASESOR", activo: true })
          .returning({ id: usuarios.id });
        if (!creado) return fail(new DomainError("VALIDACION_FALLIDA", "No se pudo crear"));
        await tx.insert(usuariosRoles).values({ usuarioId: creado.id, rolId: rolAsesor.id });

        for (const nombre of esp.value) {
          const e = await especialidadParaAsignar(tx, nombre, actor);
          if (!e.ok) return e;
          await tx
            .insert(asesorEspecialidades)
            .values({ asesorId: creado.id, especialidadId: e.value })
            .onConflictDoNothing();
        }
        return ok(creado.id);
      },
    );
    if (!r.ok) return r;
    registrar(actor, `crear asesor ${datos.dni}`);
    // Spec P15: "se le asigna el rol Asesor y se envía su acceso" (tras el commit).
    await this.emitirAcceso.execute([r.value], "ACTIVACION", new Date(), "ASESOR");
    const dto = await asesorPorId(r.value);
    return dto ? ok(dto) : noEncontrado();
  }
}

export interface CambiosAsesor {
  nombres?: string;
  apellidos?: string;
  email?: string;
  telefono?: string | null;
  grado?: string | null;
  activo?: boolean;
}

export class EditarAsesorUseCase {
  async execute(
    id: string,
    cambios: CambiosAsesor,
    actor: Actor,
  ): Promise<Result<AsesorDTO, DomainError>> {
    if (Object.keys(cambios).length === 0)
      return fail(new DomainError("VALIDACION_FALLIDA", "Nada que actualizar"));
    const r = await new DrizzleUnitOfWork(db).run(
      async (tx): Promise<Result<AsesorDTO, DomainError>> => {
        const actual = await asesorPorId(id, tx);
        if (!actual) return noEncontrado();
        const v = validarDatosAsesor({
          dni: actual.dni,
          nombres: cambios.nombres ?? actual.nombres,
          apellidos: cambios.apellidos ?? actual.apellidos,
          email: cambios.email ?? actual.email,
          telefono: cambios.telefono !== undefined ? cambios.telefono : actual.telefono,
          grado: cambios.grado !== undefined ? cambios.grado : actual.grado,
        });
        if (!v.ok) return v;
        if (v.value.email !== actual.email.toLowerCase()) {
          const [otro] = await tx
            .select({ id: usuarios.id })
            .from(usuarios)
            .where(and(sql`lower(${usuarios.email}) = ${v.value.email}`, ne(usuarios.id, id)))
            .limit(1);
          if (otro) return duplicado(`El correo ${v.value.email} ya está registrado`);
        }
        if (cambios.activo === false && actual.activo) {
          const gate = puedeDesactivarAsesor(actual.tallerActual !== null);
          if (!gate.ok) return gate;
        }
        await tx
          .update(usuarios)
          .set({
            nombres: v.value.nombres,
            apellidos: v.value.apellidos,
            email: v.value.email,
            telefono: v.value.telefono,
            grado: v.value.grado,
            ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
          })
          .where(eq(usuarios.id, id));
        const dto = await asesorPorId(id, tx);
        return dto ? ok(dto) : noEncontrado();
      },
    );
    if (r.ok) registrar(actor, `editar asesor ${r.value.dni}`);
    return r;
  }
}

// ── P10 ────────────────────────────────────────────────────────────────

async function conPerfil(
  id: string,
  actor: Actor,
  accion: string,
  fn: (tx: DbExecutor) => Promise<Result<true, DomainError>>,
): Promise<Result<PerfilAsesorDTO, DomainError>> {
  const r = await new DrizzleUnitOfWork(db).run(
    async (tx): Promise<Result<PerfilAsesorDTO, DomainError>> => {
      if (!(await esAsesor(tx, id))) return noEncontrado();
      const hecho = await fn(tx);
      if (!hecho.ok) return hecho;
      const perfil = await perfilAsesor(id, tx);
      return perfil ? ok(perfil) : noEncontrado();
    },
  );
  if (r.ok) registrar(actor, `${accion} (asesor ${r.value.asesor.dni})`);
  return r;
}

export class AgregarEspecialidadAsesorUseCase {
  async execute(
    id: string,
    nombre: string,
    actor: Actor,
  ): Promise<Result<PerfilAsesorDTO, DomainError>> {
    const v = validarNombreEspecialidad(nombre);
    if (!v.ok) return v;
    return conPerfil(id, actor, `agregar especialidad ${v.value}`, async (tx) => {
      const e = await especialidadParaAsignar(tx, v.value, actor);
      if (!e.ok) return e;
      await tx
        .insert(asesorEspecialidades)
        .values({ asesorId: id, especialidadId: e.value })
        .onConflictDoNothing();
      return ok(true);
    });
  }
}

export class QuitarEspecialidadAsesorUseCase {
  execute(
    id: string,
    especialidadId: string,
    actor: Actor,
  ): Promise<Result<PerfilAsesorDTO, DomainError>> {
    return conPerfil(id, actor, `quitar especialidad ${especialidadId}`, async (tx) => {
      const borradas = await tx
        .delete(asesorEspecialidades)
        .where(
          and(
            eq(asesorEspecialidades.asesorId, id),
            eq(asesorEspecialidades.especialidadId, especialidadId),
          ),
        )
        .returning({ id: asesorEspecialidades.especialidadId });
      if (borradas.length === 0)
        return fail(new DomainError("NO_ENCONTRADO", "El asesor no tiene esa especialidad"));
      return ok(true);
    });
  }
}

export interface ArchivoSubido {
  filename: string;
  mime: string;
  bytes: Uint8Array;
}

export class SubirArchivoAsesorUseCase {
  constructor(private readonly storage: AlmacenamientoPort) {}

  async execute(
    id: string,
    archivo: ArchivoSubido,
    actor: Actor,
  ): Promise<Result<PerfilAsesorDTO, DomainError>> {
    const v = validarArchivo(
      { mime: archivo.mime, bytes: archivo.bytes.byteLength },
      FORMATOS_ARCHIVO_ASESOR,
      MAX_MB_ARCHIVO_ASESOR,
    );
    if (!v.ok) return v;
    // Cabecera real del PDF: el tipo declarado por el navegador no basta.
    const cabecera = new TextDecoder().decode(archivo.bytes.subarray(0, 5));
    if (cabecera !== "%PDF-")
      return fail(new DomainError("DOCUMENTO_INVALIDO", "El archivo no es un PDF válido"));
    if (!(await esAsesor(db, id))) return noEncontrado();
    const guardado = await this.storage.save(
      id,
      `${randomUUID()}.pdf`,
      archivo.bytes,
      "perfil-asesor",
    );
    const nombre = archivo.filename.trim().slice(0, 255) || "archivo.pdf";
    return conPerfil(id, actor, `subir archivo ${nombre}`, async (tx) => {
      await tx.insert(asesorArchivos).values({
        asesorId: id,
        ruta: guardado.ruta,
        sha256: guardado.sha256,
        nombreOriginal: nombre,
        mime: archivo.mime,
        bytes: archivo.bytes.byteLength,
        creadoPor: idActor(actor),
      });
      return ok(true);
    });
  }
}

export class EliminarArchivoAsesorUseCase {
  execute(
    id: string,
    archivoId: string,
    actor: Actor,
  ): Promise<Result<PerfilAsesorDTO, DomainError>> {
    return conPerfil(id, actor, `eliminar archivo ${archivoId}`, async (tx) => {
      const marcados = await tx
        .update(asesorArchivos)
        .set({ eliminadoAt: new Date(), eliminadoPor: idActor(actor), updatedAt: new Date() })
        .where(
          and(
            eq(asesorArchivos.id, archivoId),
            eq(asesorArchivos.asesorId, id),
            isNull(asesorArchivos.eliminadoAt),
          ),
        )
        .returning({ id: asesorArchivos.id });
      if (marcados.length === 0)
        return fail(new DomainError("NO_ENCONTRADO", "Archivo no encontrado"));
      return ok(true);
    });
  }
}
