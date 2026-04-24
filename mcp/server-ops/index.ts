import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ATICCI MCP server-ops running");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
