import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execa } from "execa";

async function runSsh(command: string) {
  const result = await execa("ssh", [
    "aticci-server",
    command
  ], {
    timeout: 30000
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
      const [hostname, user, uptime, disk, docker] = await Promise.all([
        runSsh("hostname"),
        runSsh("whoami"),
        runSsh("uptime"),
        runSsh("df -h /"),
        runSsh("docker ps --format ""table {{.Names}}\t{{.Status}}""")
      ]);

      return {
        content: [
          {
            type: "text",
            text: `
HOSTNAME:
${hostname}

USER:
${user}

UPTIME:
${uptime}

DISK:
${disk}

DOCKER:
${docker}
`
          }
        ]
      };
    }
  });
}
