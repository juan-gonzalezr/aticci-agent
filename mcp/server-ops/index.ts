import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { execa } from "execa";

const server = new Server(
  {
    name: "aticci-server-ops",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

async function getServerStatus() {
  const hostname = await execa("ssh", ["aticci@100.64.0.1", "hostname"]);
  const whoami = await execa("ssh", ["aticci@100.64.0.1", "whoami"]);
  const uptime = await execa("ssh", ["aticci@100.64.0.1", "uptime"]);
  const disk = await execa("ssh", ["aticci@100.64.0.1", "df -h /"]);
  const docker = await execa("ssh", [
    "aticci@100.64.0.1",
    "docker ps --format 'table {{.Names}}\t{{.Status}}'"
  ]);

  return `
HOSTNAME:
${hostname.stdout}

USER:
${whoami.stdout}

UPTIME:
${uptime.stdout}

DISK:
${disk.stdout}

DOCKER:
${docker.stdout}
`;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "server_status",
        description: "Get ATICCI server status via SSH. Read-only.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "server_status") {
    const result = await getServerStatus();

    return {
      content: [
        {
          type: "text",
          text: result
        }
      ]
    };
  }

  throw new Error("Tool not found");
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ATICCI MCP server-ops running");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
