#!/usr/bin/env node
/**
 * zotero-mcp — An MCP server that gives Claude access to your Zotero library.
 *
 * Tools exposed:
 *   - zotero_search        Search your library by query, tag, or collection
 *   - zotero_get_item      Get full metadata for a specific item by key
 *   - zotero_collections   List all collections in your library
 *   - zotero_cite          Format citations for one or more items
 *   - zotero_bibliography  Generate a formatted bibliography from item keys
 *
 * Configuration is via environment variables:
 *   ZOTERO_MODE       "local" (default) or "web"
 *   ZOTERO_USER_ID    required for web mode
 *   ZOTERO_API_KEY    required for web mode
 *   ZOTERO_LOCAL_PORT defaults to 23119
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ZoteroClient, type ZoteroItem } from "./zotero-client.js";
import {
  formatInlineCitation,
  formatBibliographyEntry,
  formatBibliography,
} from "./formatter.js";

// --- Config from env ---
const mode = (process.env.ZOTERO_MODE ?? "local") as "local" | "web";
const client = new ZoteroClient({
  mode,
  userId: process.env.ZOTERO_USER_ID,
  apiKey: process.env.ZOTERO_API_KEY,
  localPort: process.env.ZOTERO_LOCAL_PORT
    ? parseInt(process.env.ZOTERO_LOCAL_PORT, 10)
    : undefined,
});

// --- Helpers ---

/** Summarise an item into a compact, readable block for Claude. */
function summariseItem(item: ZoteroItem): string {
  const d = item.data;
  const authors =
    d.creators
      ?.map((c) => c.lastName ?? c.name ?? "Unknown")
      .join(", ") ?? "Unknown";
  const year = d.date?.match(/\d{4}/)?.[0] ?? "n.d.";
  const lines = [
    `**${d.title}**`,
    `Authors: ${authors}`,
    `Year: ${year}  |  Type: ${d.itemType}  |  Key: \`${d.key}\``,
  ];
  if (d.publicationTitle) lines.push(`Journal: ${d.publicationTitle}`);
  if (d.publisher) lines.push(`Publisher: ${d.publisher}`);
  if (d.DOI) lines.push(`DOI: ${d.DOI}`);
  if (d.pages) lines.push(`Pages: ${d.pages}`);
  if (d.tags?.length) lines.push(`Tags: ${d.tags.map((t) => t.tag).join(", ")}`);
  if (d.abstractNote) {
    const abstract =
      d.abstractNote.length > 300
        ? d.abstractNote.slice(0, 300) + "…"
        : d.abstractNote;
    lines.push(`Abstract: ${abstract}`);
  }
  return lines.join("\n");
}

// --- Server setup ---

const server = new McpServer({
  name: "zotero-mcp",
  version: "0.1.0",
});

// ──────────────────────────────────────────
// Tool: zotero_search
// ──────────────────────────────────────────
server.tool(
  "zotero_search",
  "Search your Zotero library by query string. Searches title, author, and year. Optionally filter by tag or collection key.",
  {
    query: z.string().describe("Search query (e.g. 'Brandom inferentialism')"),
    tag: z.string().optional().describe("Filter by tag (e.g. 'pragmatism')"),
    collection: z
      .string()
      .optional()
      .describe("Collection key to search within"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Max results (default 10)"),
  },
  async ({ query, tag, collection, limit }) => {
    try {
      const items = await client.searchItems(query, {
        limit: limit ?? 10,
        tag,
        collection,
      });
      if (items.length === 0) {
        return { content: [{ type: "text", text: `No results for "${query}".` }] };
      }
      const text = items.map((item) => summariseItem(item)).join("\n\n---\n\n");
      return {
        content: [
          {
            type: "text",
            text: `Found ${items.length} result(s) for "${query}":\n\n${text}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error searching Zotero: ${error}` }],
        isError: true,
      };
    }
  }
);

// ──────────────────────────────────────────
// Tool: zotero_get_item
// ──────────────────────────────────────────
server.tool(
  "zotero_get_item",
  "Get full metadata for a Zotero item by its key. Returns all fields including abstract, tags, collections, and CSL-JSON.",
  {
    key: z.string().describe("Zotero item key (e.g. 'ABC12345')"),
  },
  async ({ key }) => {
    try {
      const item = await client.getItem(key);
      const summary = summariseItem(item);
      const citation = formatBibliographyEntry(item);
      const cslBlock = item.csljson
        ? `\n\nCSL-JSON:\n\`\`\`json\n${JSON.stringify(item.csljson, null, 2)}\n\`\`\``
        : "";
      return {
        content: [
          {
            type: "text",
            text: `${summary}\n\nFormatted citation:\n${citation}${cslBlock}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error fetching item: ${error}` }],
        isError: true,
      };
    }
  }
);

// ──────────────────────────────────────────
// Tool: zotero_collections
// ──────────────────────────────────────────
server.tool(
  "zotero_collections",
  "List all collections in your Zotero library. Returns collection names and keys.",
  {},
  async () => {
    try {
      const collections = await client.listCollections();
      if (collections.length === 0) {
        return { content: [{ type: "text", text: "No collections found." }] };
      }
      const text = collections
        .map((c) => `- **${c.data.name}** (key: \`${c.data.key}\`)`)
        .join("\n");
      return {
        content: [
          { type: "text", text: `${collections.length} collection(s):\n\n${text}` },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error listing collections: ${error}` }],
        isError: true,
      };
    }
  }
);

// ──────────────────────────────────────────
// Tool: zotero_cite
// ──────────────────────────────────────────
server.tool(
  "zotero_cite",
  "Generate inline citations and full reference entries for one or more Zotero items. Provide item keys. Useful when writing documents — gives you the exact citation text to insert.",
  {
    keys: z
      .array(z.string())
      .min(1)
      .describe("Array of Zotero item keys to cite"),
  },
  async ({ keys }) => {
    try {
      const items = await Promise.all(keys.map((k) => client.getItem(k)));
      const citations = items.map((item) => ({
        inline: formatInlineCitation(item),
        full: formatBibliographyEntry(item),
        key: item.data.key,
        title: item.data.title,
      }));
      const text = citations
        .map(
          (c) =>
            `**${c.title}** [\`${c.key}\`]\n  Inline: ${c.inline}\n  Full: ${c.full}`
        )
        .join("\n\n");
      return { content: [{ type: "text", text }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error generating citations: ${error}` }],
        isError: true,
      };
    }
  }
);

// ──────────────────────────────────────────
// Tool: zotero_bibliography
// ──────────────────────────────────────────
server.tool(
  "zotero_bibliography",
  "Generate a formatted bibliography (Works Cited) from a list of Zotero item keys. Returns entries sorted alphabetically, ready to paste into a document.",
  {
    keys: z
      .array(z.string())
      .min(1)
      .describe("Array of Zotero item keys to include"),
  },
  async ({ keys }) => {
    try {
      const items = await Promise.all(keys.map((k) => client.getItem(k)));
      const bib = formatBibliography(items);
      return {
        content: [
          {
            type: "text",
            text: `## Works Cited\n\n${bib}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error generating bibliography: ${error}` }],
        isError: true,
      };
    }
  }
);

// --- Start ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`zotero-mcp running in ${mode} mode`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
