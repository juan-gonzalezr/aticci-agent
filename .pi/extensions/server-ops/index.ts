import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execa } from "execa";

async function runSsh(command: string) {
  const result = await execa("ssh", [
    "aticci-server",
    command
  ], {
    timeout: 60000
  });

  return result.stdout;
}

export default function (pi: ExtensionAPI) {

  pi.registerCommand("logs", {
    description: "Ver logs de un contenedor. Ejemplo: /logs ollama",
    handler: async (args, ctx) => {
      if (!args) {
        ctx.ui.notify("Uso: /logs nombre_del_contenedor", "warning");
        return;
      }

      const container = args.trim();

      const result = await runSsh(
        `docker logs --tail 100 ${container} 2>&1`
      );

      ctx.ui.notify(result || "Sin logs disponibles.", "info");
    }
  });

  pi.registerCommand("dockerlist", {
    description: "Mostrar todos los contenedores Docker del servidor",
    handler: async (_args, ctx) => {
      const result = await runSsh(
        'docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"'
      );
      ctx.ui.notify(result, "info");
    }
  });

  pi.registerCommand("dockerdown", {
    description: "Mostrar contenedores Docker detenidos",
    handler: async (_args, ctx) => {
      const result = await runSsh(
        'docker ps -a --filter "status=exited" --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"'
      );
      ctx.ui.notify(result || "No hay contenedores detenidos.", "info");
    }
  });

  pi.registerCommand("ollamamodels", {
    description: "Mostrar modelos instalados en Ollama",
    handler: async (_args, ctx) => {
      const result = await runSsh(
        'docker exec ollama ollama list'
      );
      ctx.ui.notify(result, "info");
    }
  });

  pi.registerCommand("ollamaps", {
    description: "Mostrar modelos cargados en memoria",
    handler: async (_args, ctx) => {
      const result = await runSsh(
        'docker exec ollama ollama ps'
      );
      ctx.ui.notify(result || "No hay modelos cargados actualmente.", "info");
    }
  });

  pi.registerCommand("ollamatest", {
    description: "Probar respuesta real vía API HTTP de Ollama",
    handler: async (_args, ctx) => {
      const result = await runSsh(`
START=$(date +%s)

curl -s http://100.64.0.1:11434/api/generate \
-d '{
  "model": "llama3.1:8b",
  "prompt": "responde solo: ok",
  "stream": false
}'

END=$(date +%s)

echo ""
echo "Duración: $((END - START)) segundos"

docker exec ollama ollama ps
`);

      ctx.ui.notify(result, "info");
    }
  });

  pi.registerCommand("serverstatus", {
    description: "Mostrar estado general del servidor",
    handler: async (_args, ctx) => {
      const result = await runSsh(`
hostname &&
echo "" &&
whoami &&
echo "" &&
uptime &&
echo "" &&
df -h / &&
echo "" &&
docker ps --format "table {{.Names}}\t{{.Status}}"
`);
      ctx.ui.notify(result, "info");
    }
  });

  pi.registerCommand("planehealth", {
    description: "Diagnóstico rápido de Plane",
    handler: async (_args, ctx) => {
      const result = await runSsh(`
  echo "===== PLANE CONTAINERS ====="
  docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "plane-|NAME"

  echo ""
  echo "===== PLANE API HEALTH ====="
  curl -s -H "Host: plane.aticci" http://localhost/api/instances/ || true

  echo ""
  echo "===== RECENT ERRORS ====="
  docker logs --tail 300 plane-api 2>&1 | grep -iE "error|failed|exception|smtp|s3|minio|redis|postgres" | tail -n 30 || true

  echo ""
  echo "===== WORKER RECENT ERRORS ====="
  docker logs --tail 300 plane-worker 2>&1 | grep -iE "error|failed|exception|smtp|s3|minio|redis|postgres" | tail -n 30 || true
  `);

      ctx.ui.notify(result || "Sin salida.", "info");
    }
  });

  pi.registerCommand("planeconfig", {
    description: "Revisar configuración interna de Plane (SMTP + S3)",
    handler: async (_args, ctx) => {
      const result = await runSsh(`
      docker exec plane-db psql -U plane -d plane -x -c "
      SELECT key, value, category, is_encrypted
      FROM instance_configurations
      WHERE key IN (
        'ENABLE_SMTP',
        'EMAIL_FROM',
        'EMAIL_HOST',
        'EMAIL_HOST_USER',
        'EMAIL_PORT',
        'EMAIL_USE_TLS',
        'EMAIL_USE_SSL',
        'ENABLE_S3_STORAGE',
        'AWS_ACCESS_KEY_ID',
        'AWS_STORAGE_BUCKET_NAME',
        'AWS_S3_ENDPOINT_URL',
        'AWS_S3_REGION_NAME',
        'USE_MINIO'
      );
      "
      `);

      ctx.ui.notify(result || "No se encontraron configuraciones.", "info");
    }
  });

  pi.registerCommand("planes3config", {
    description: "Revisar configuración S3/MinIO/Storage de Plane",
    handler: async (_args, ctx) => {
      const result = await runSsh(`
    docker exec plane-db psql -U plane -d plane -x -c "
    SELECT key, value, category, is_encrypted
    FROM instance_configurations
    WHERE key ILIKE '%S3%'
      OR key ILIKE '%MINIO%'
      OR key ILIKE '%STORAGE%'
      OR key ILIKE '%BUCKET%'
      OR key ILIKE '%AWS%'
    ORDER BY category, key;
    "
    `);

      ctx.ui.notify(result || "No se encontraron configuraciones S3/MinIO/Storage.", "info");
    }
  });

  pi.registerCommand("planeenv", {
    description: "Revisar variables env relevantes de Plane sin exponer secretos completos",
    handler: async (_args, ctx) => {
      const result = await runSsh(`
    docker inspect plane-api --format '{{range .Config.Env}}{{println .}}{{end}}' |
    grep -Ei 'SMTP|EMAIL|S3|AWS|MINIO|STORAGE|BUCKET|REDIS|POSTGRES|DATABASE|WEB_URL|CORS|SECRET|KEY' |
    sed -E 's/(PASSWORD|SECRET|KEY|TOKEN|ACCESS_KEY|SECRET_KEY)=.*/\\1=***MASKED***/I'
    `);

      ctx.ui.notify(result || "No se encontraron variables relevantes.", "info");
    }
  });

}
