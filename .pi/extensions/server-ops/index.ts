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
  pi.registerTool({
    name: "aticci_server_status",
    description: "Consulta el estado general del servidor ATICCI por SSH. Solo lectura.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    },

    async execute() {
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

      return { content: [{ type: "text", text: result }] };
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
      const result = await runSsh('docker exec ollama ollama list');
      ctx.ui.notify(result, "info");
    }
  });

  pi.registerCommand("ollamaps", {
    description: "Mostrar modelos cargados en memoria",
    handler: async (_args, ctx) => {
      const result = await runSsh('docker exec ollama ollama ps');
      ctx.ui.notify(result || "No hay modelos cargados actualmente.", "info");
    }
  });

  pi.registerCommand("ollamatest", {
  description: "Probar latencia real de llama3.1:8b en Ollama",
  handler: async (_args, ctx) => {
    const result = await runSsh(`
    START=$(date +%s)
    RESP=$(docker exec ollama ollama run llama3.1:8b "responde solo: ok")
    END=$(date +%s)
    echo "Respuesta: $RESP"
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
}
