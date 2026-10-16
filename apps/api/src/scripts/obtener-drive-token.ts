import { existsSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { resolve } from "node:path";
import { OAuth2Client } from "google-auth-library";
import "../config/cargar-env.js";

async function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(
      "❌ Error: GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET no están definidos en tu archivo .env",
    );
    console.log("\nPara obtenerlos en Google Cloud Console:");
    console.log("1. Selecciona 'App de escritorio' o 'Aplicación web'.");
    console.log("2. Copia el ID de cliente y el Secreto de cliente en situnsa/.env:");
    console.log("   GOOGLE_CLIENT_ID=tu_cliente_id.apps.googleusercontent.com");
    console.log("   GOOGLE_CLIENT_SECRET=tu_secreto\n");
    process.exit(1);
  }

  const redirectUri = "http://localhost:3333/oauth2callback";
  const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive"],
  });

  console.log("=================================================================");
  console.log("   VINCULACIÓN DE GOOGLE DRIVE PERSONAL (OAUTH 2.0)");
  console.log("=================================================================\n");
  console.log("Abre este enlace en tu navegador para autorizar a SITUNSA en tu Drive personal:\n");
  console.log(authUrl);
  console.log("\nEsperando autorización en http://localhost:3333/oauth2callback ...\n");

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "", `http://${req.headers.host}`);
      if (url.pathname === "/oauth2callback") {
        const code = url.searchParams.get("code");
        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<h1>Error: No se recibió el código de autorización</h1>");
          return;
        }

        const { tokens } = await oauth2Client.getToken(code);
        if (!tokens.refresh_token) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            "<h1>Advertencia: No se recibió refresh_token. Revoca los permisos previos e intenta de nuevo.</h1>",
          );
          console.warn("⚠️ No se recibió refresh_token. Es posible que ya hayas dado permisos.");
          server.close();
          process.exit(0);
        }

        // Guardar refresh_token en .env
        const candidatas = [
          resolve(process.cwd(), ".env"),
          resolve(process.cwd(), "..", ".env"),
          resolve(process.cwd(), "../..", ".env"),
          "/home/miguel/Projects/SITUNSA/situnsa/.env",
        ];
        const envPath = candidatas.find(existsSync) ?? "/home/miguel/Projects/SITUNSA/situnsa/.env";
        let envContent = readFileSync(envPath, "utf8");
        if (envContent.includes("GOOGLE_DRIVE_REFRESH_TOKEN=")) {
          envContent = envContent.replace(
            /GOOGLE_DRIVE_REFRESH_TOKEN=.*/,
            `GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`,
          );
        } else {
          envContent += `\nGOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
        }
        writeFileSync(envPath, envContent, "utf8");

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<h1>¡Autorización completada con éxito!</h1><p>Ya puedes cerrar esta ventana y regresar a la terminal.</p>",
        );

        console.log("✓ GOOGLE_DRIVE_REFRESH_TOKEN guardado exitosamente en situnsa/.env!");
        console.log("✓ Todo listo para sincronizar archivos en tu Google Drive personal.\n");
        server.close();
        process.exit(0);
      }
    } catch (err) {
      console.error("Error al procesar callback:", err);
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>Error interno al procesar autorización</h1>");
      server.close();
      process.exit(1);
    }
  });

  server.listen(3333);
}

main().catch(console.error);
