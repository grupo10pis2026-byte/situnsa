#!/bin/sh
set -e

echo "=== Iniciando Situnsa en Render ==="

# 1. Configurar puerto dinámico en Nginx
PORT=${PORT:-10000}
echo "Configurando Nginx en puerto $PORT..."
# En Alpine, conf.d/*.conf se incluye en contexto root (server es ilegal ahí);
# los virtual hosts van en http.d/ (dentro del bloque http).
mkdir -p /etc/nginx/http.d /run/nginx /var/data/titulacion-docs
sed "s/__PORT__/$PORT/g" /etc/nginx/nginx.render.conf > /etc/nginx/http.d/default.conf

# 2. Esperar conexión a Postgres si DATABASE_URL está definida
if [ -n "$DATABASE_URL" ]; then
  echo "Esperando conexión a la base de datos..."
  node -e '
    // Resolver pg vía el workspace @pis/db: el layout aislado de pnpm no lo
    // expone en /app/node_modules y require("pg") pelado falla (MODULE_NOT_FOUND).
    const { createRequire } = require("module");
    const pg = createRequire("/app/packages/db/dist/migrate.js")("pg");
    const url = process.env.DATABASE_URL;
    const useSsl = process.env.DATABASE_SSL === "true" || url.includes("sslmode=require") || url.includes("render.com");
    const pool = new pg.Pool({ connectionString: url, ssl: useSsl ? { rejectUnauthorized: false } : undefined, connectionTimeoutMillis: 5000 });
    async function check() {
      for (let i = 0; i < 30; i++) {
        try {
          const client = await pool.connect();
          await client.query("SELECT 1");
          client.release();
          await pool.end();
          console.log("PostgreSQL listo!");
          process.exit(0);
        } catch (err) {
          console.log(`Intento ${i+1}/30 fallido (${err.message}). Reintentando en 2s...`);
          await new Promise(r => setTimeout(r, 2000));
        }
      }
      console.error("No se pudo conectar a PostgreSQL tras 30 intentos");
      process.exit(1);
    }
    check();
  '

  # 3. Aplicar migraciones y seed
  # SEED_MODE=demo (default): catálogos + roles + usuarios demo (00000001/x).
  # Solo para demo: cualquiera que conozca el DNI entra. Para uso serio,
  # poner SEED_MODE=base (solo catálogos+roles, sin usuarios demo) y crear
  # el admin a mano por SQL.
  echo "Aplicando migraciones versionadas..."
  node packages/db/dist/migrate.js

  if [ "${SEED_MODE:-demo}" = "base" ]; then
    echo "Ejecutando seed base (sin usuarios demo)..."
    node packages/db/dist/seed-base.js
  else
    echo "Ejecutando seed de datos demo..."
    node packages/db/dist/seed.js
  fi
else
  echo "ERROR: DATABASE_URL es obligatoria."
  exit 1
fi

# 4. Arrancar Fastify API en background
echo "Arrancando Fastify API en 127.0.0.1:3001..."
PORT=3001 HOST=127.0.0.1 node apps/api/dist/server.js &
API_PID=$!

# 5. Arrancar Nginx en background
echo "Arrancando Nginx..."
nginx -g "daemon off;" &
NGINX_PID=$!

# Manejador de señales
cleanup() {
  echo "Cerrando servicios..."
  kill -TERM "$API_PID" "$NGINX_PID" 2>/dev/null || true
  exit 0
}

trap cleanup INT TERM

# Esperar a que cualquiera termine
wait -n "$API_PID" "$NGINX_PID"
