
import express from "express";
import { createHash } from "node:crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from
  "@modelcontextprotocol/sdk/server/streamableHttp.js";

const app = express();
app.use(express.json());

const EMAIL = "25f1001426@ds.study.iitm.ac.in";

function createMcpServer(challenge: string | undefined) {
  const server = new McpServer({
    name: "exam-challenge-server",
    version: "1.0.0",
  });

  // Expose exactly one tool, with no required input properties.
  server.registerTool(
    "solve_challenge",
    {
      description:
        "Computes the challenge response from the current HTTP request header.",
      inputSchema: {},
    },
    async () => {
      if (!challenge || !/^[0-9a-f]{32}$/.test(challenge)) {
        throw new Error("Missing or invalid X-Exam-Challenge header");
      }

      const normalizedEmail = EMAIL.trim().toLowerCase();
      const payload = `${challenge}:${normalizedEmail}`;

      const answer = createHash("sha256")
        .update(payload, "utf8")
        .digest("hex")
        .slice(0, 16);

      return {
        content: [
          {
            type: "text",
            text: answer,
          },
        ],
      };
    }
  );

  return server;
}

// Stateless MCP endpoint: each POST gets a fresh transport.
app.post("/mcp", async (req, res) => {
  const challenge = req.get("X-Exam-Challenge") ?? undefined;
  const server = createMcpServer(challenge);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error",
      });
    }
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
});

// Stateless mode does not provide an SSE GET stream.
app.get("/mcp", (_req, res) => {
  res.status(405).send("Method Not Allowed");
});

app.delete("/mcp", (_req, res) => {
  res.status(405).send("Method Not Allowed");
});

// Simple health check for deployment diagnostics.
app.get("/", (_req, res) => {
  res.status(200).send("Exam MCP server is running");
});

const port = Number(process.env.PORT ?? 3000);

app.listen(port, "0.0.0.0", () => {
  console.log(`MCP server listening on port ${port}`);
});
