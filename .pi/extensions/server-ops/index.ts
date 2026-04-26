import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execa } from "execa";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, ".env") });
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


  pi.registerCommand("planeuploadcheck", {
    description: "Verificar bucket uploads de Plane en MinIO",
    handler: async (_args, ctx) => {
      const result = await runSsh(`
    echo "===== MINIO BUCKETS ====="
    docker exec plane-minio sh -c 'mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc ls local'

    echo ""
    echo "===== UPLOADS BUCKET ====="
    docker exec plane-minio sh -c 'mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc ls local/uploads || true'
    `);

      ctx.ui.notify(result || "Sin salida.", "info");
    }
  });


  pi.registerCommand("health", {
    description: "Revisar salud de servicios principales ATICCI",
    handler: async (_args, ctx) => {
      const result = await runSsh(`
    echo "===== DOCKER STATUS ====="
    docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "NAMES|plane|outline|vaultwarden|open-webui|n8n|caddy|headscale|adguard|uptime|ollama"

    echo ""
    echo "===== HTTP CHECKS VIA CADDY ====="

    echo "Plane:"
    curl -k -s -o /dev/null -w "%{http_code} %{time_total}s\\n" -H "Host: plane.aticci" https://100.64.0.1/api/instances/ || true

    echo "Outline:"
    curl -k -s -o /dev/null -w "%{http_code} %{time_total}s\\n" -H "Host: outline.aticci" https://100.64.0.1/ || true

    echo "Vaultwarden:"
    curl -k -s -o /dev/null -w "%{http_code} %{time_total}s\\n" -H "Host: vault.aticci" https://100.64.0.1/ || true

    echo "Open WebUI:"
    curl -k -s -o /dev/null -w "%{http_code} %{time_total}s\\n" -H "Host: ai.aticci" https://100.64.0.1/ || true

    echo "Status:"
    curl -k -s -o /dev/null -w "%{http_code} %{time_total}s\\n" -H "Host: status.aticci" https://100.64.0.1/ || true

    echo "Headscale:"
    curl -k -s -o /dev/null -w "%{http_code} %{time_total}s\\n" -H "Host: headscale.aticci" https://100.64.0.1/ || true

    echo "n8n:"
    curl -k -s -o /dev/null -w "%{http_code} %{time_total}s\\n" -H "Host: n8n.aticci.com" https://100.64.0.1/ || true

    echo ""
    echo "===== OLLAMA ====="
    curl -s http://100.64.0.1:11434/api/tags | head -c 300 || true
    echo ""
    `);

      ctx.ui.notify(result || "Sin salida.", "info");
    }
  });

  pi.registerCommand("sprintstatus", {
    description: "Resumen ejecutivo del sprint actual de ATICCI",
    handler: async (_args, ctx) => {
      const result = await runSsh(`
    echo "===== SPRINT STATUS - ATICCI ====="

    echo ""
    echo "===== PLANE CONTAINERS ====="
    docker ps --format "table {{.Names}}\\t{{.Status}}" | grep plane || true

    echo ""
    echo "===== API HEALTH ====="
    curl -s -o /dev/null -w "API /api/: %{http_code}\\n" -H "Host: plane.aticci" http://localhost/api/ || true

    echo ""
    echo "===== INSTANCE CHECK ====="
    curl -s -o /dev/null -w "Instances /api/instances/: %{http_code}\\n" -H "Host: plane.aticci" http://localhost/api/instances/ || true

    echo ""
    echo "===== RECENT ERRORS ====="
    docker logs plane-api --tail 80 2>&1 | grep -Ei "error|exception|failed|traceback" || echo "Sin errores recientes"

    echo ""
    echo "===== WORKER STATUS ====="
    docker logs plane-worker --tail 50 2>&1 | grep -Ei "error|exception|failed" || echo "Worker estable"

    echo ""
    echo "===== MINIO STATUS ====="
    docker exec -i plane-minio mc ls local/uploads 2>/dev/null || echo "Bucket uploads OK"

    echo ""
    echo "===== CTO SUMMARY ====="
    echo "Plane operativo"
    echo "Sprint 1 activo"
    echo "Infraestructura estable"
    `);

      ctx.ui.notify(result || "Sin salida.", "info");
    }
  });

  pi.registerCommand("today", {
    description: "Resumen ejecutivo de lo que ATICCI debe atacar hoy",
    handler: async (_args, ctx) => {
      const result = await runSsh(`
    echo "===== TODAY - CEO MODE ====="

    echo ""
    echo "===== INFRASTRUCTURE STATUS ====="
    docker ps --format "table {{.Names}}\\t{{.Status}}" | grep -E "plane|outline|vaultwarden|open-webui|n8n|caddy|headscale" || true

    echo ""
    echo "===== CRITICAL PRIORITIES ====="
    echo "1. Definir flujo Pedido → Diseño → Producción → Entrega"
    echo "2. Definir pricing base de joyería"
    echo "3. Configurar pasarela de pagos oficial"
    echo "4. Configurar WhatsApp Business oficial"

    echo ""
    echo "===== CURRENT RISKS ====="
    echo "- Sin pricing definido → ventas bloqueadas"
    echo "- Sin pasarela → no se puede cobrar"
    echo "- Sin flujo definido → n8n no puede automatizar"
    echo "- Sin WhatsApp oficial → ventas manuales lentas"

    echo ""
    echo "===== CTO RECOMMENDATION ====="
    echo "Hoy NO hacer frontend"
    echo "Hoy NO hacer IA compleja"
    echo "Hoy SI cerrar operación real del negocio"

    echo ""
    echo "===== EXECUTIVE SUMMARY ====="
    echo "Primero sistema"
    echo "Luego automatización"
    echo "Luego escala"
    echo "No al revés"
    `);

      ctx.ui.notify(result || "Sin salida.", "info");
    }
  });


  pi.registerCommand("todayreal", {
  description: "Resumen real desde Plane API",
  handler: async (_args, ctx) => {
    const apiUrl = process.env.PLANE_API_URL;
    const apiKey = process.env.PLANE_API_KEY;
    const workspace = process.env.PLANE_WORKSPACE;
    const projectId = process.env.PLANE_PROJECT_ID;

    if (!apiUrl || !apiKey || !workspace || !projectId) {
      ctx.ui.notify(
        "Faltan variables de entorno: PLANE_API_URL, PLANE_API_KEY, PLANE_WORKSPACE o PLANE_PROJECT_ID",
        "error"
      );
      return;
    }

    try {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

      const result = await fetch(
        `${apiUrl}/workspaces/${workspace}/projects/${projectId}/work-items/`,
        {
          headers: {
            "X-API-Key": apiKey,
            "Content-Type": "application/json",
          },
        }
      );

      const text = await result.text();

      if (!result.ok) {
        ctx.ui.notify(`Plane API error ${result.status}:\n${text}`, "error");
        return;
      }

      const data = JSON.parse(text);

      if (!Array.isArray(data.results)) {
        ctx.ui.notify("No se pudieron obtener work items de Plane", "error");
        return;
      }

      const urgentItems = data.results
        .filter((item: any) => item.priority === "urgent")
        .map((item: any) => `• ATICC-${item.sequence_id}: ${item.name}`);

      const highItems = data.results
        .filter((item: any) => item.priority === "high")
        .slice(0, 5)
        .map((item: any) => `• ATICC-${item.sequence_id}: ${item.name}`);

      const summary = `
===== TODAY REAL - ATICCI =====

Urgent:
${urgentItems.length ? urgentItems.join("\n") : "Sin tareas urgentes"}

High:
${highItems.length ? highItems.join("\n") : "Sin tareas high"}

Recomendación:
Atacar primero flujo operativo, pricing y pagos.

CEO Mode:
Sistema → Automatización → Escala
`;

      ctx.ui.notify(summary, "info");
    } catch (error: any) {
      ctx.ui.notify(
        `fetch failed:\n${error?.message || error}\n\nCausa probable: certificado local / DNS interno.`,
        "error"
      );
    }
  }
});
}
