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
 *   - zotero_get_notes     Get notes and annotations attached to an item
 *   - zotero_get_attachments  Get PDF and file attachments for an item
 *   - zotero_cite_stub        Generate validated citation stubs for .docx documents
 *
 * Configuration is via environment variables:
 *   ZOTERO_MODE          "local" (default) or "web"
 *   ZOTERO_LIBRARY_TYPE  "user" (default) or "group"
 *   ZOTERO_GROUP_ID      required for group libraries
 *   ZOTERO_USER_ID       required for web mode (user libraries)
 *   ZOTERO_API_KEY       required for web mode
 *   ZOTERO_LOCAL_PORT    defaults to 23119
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
import { htmlToMarkdown } from "./html-utils.js";

// --- Config from env ---
const mode = (process.env.ZOTERO_MODE ?? "local") as "local" | "web";
const libraryType = (process.env.ZOTERO_LIBRARY_TYPE ?? "user") as "user" | "group";
const client = new ZoteroClient({
  mode,
  libraryType,
  groupId: process.env.ZOTERO_GROUP_ID,
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
    style: z
      .string()
      .optional()
      .describe("CSL style: 'chicago-author-date' (default), 'apa', 'mla', 'ieee', 'harvard'"),
  },
  async ({ keys, style }) => {
    try {
      const items = await client.getItems(keys);
      const citations = items.map((item) => ({
        inline: formatInlineCitation(item, style),
        full: formatBibliographyEntry(item, style),
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
    style: z
      .string()
      .optional()
      .describe("CSL style: 'chicago-author-date' (default), 'apa', 'mla', 'ieee', 'harvard'"),
  },
  async ({ keys, style }) => {
    try {
      const items = await client.getItems(keys);
      const bib = formatBibliography(items, style);
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

// ──────────────────────────────────────────
// Tool: zotero_get_notes
// ──────────────────────────────────────────
server.tool(
  "zotero_get_notes",
  "Get notes and annotations attached to a Zotero item. Returns note content as Markdown and PDF annotations with highlighted text, comments, and page numbers.",
  {
    key: z.string().describe("Zotero item key (e.g. 'ABC12345')"),
  },
  async ({ key }) => {
    try {
      const children = await client.getItemChildren(key);

      const notes = children.filter(
        (c) => c.data.itemType === "note"
      );
      const annotations = children.filter(
        (c) => c.data.itemType === "annotation"
      );

      if (notes.length === 0 && annotations.length === 0) {
        return {
          content: [
            { type: "text", text: `No notes or annotations found for item \`${key}\`.` },
          ],
        };
      }

      const sections: string[] = [];

      if (notes.length > 0) {
        sections.push(`## Notes (${notes.length})\n`);
        for (const note of notes) {
          const noteHtml = (note.data as Record<string, unknown>).note as string ?? "";
          const md = htmlToMarkdown(noteHtml);
          sections.push(md);
          sections.push("---");
        }
      }

      if (annotations.length > 0) {
        sections.push(`## Annotations (${annotations.length})\n`);
        for (const ann of annotations) {
          const d = ann.data as Record<string, unknown>;
          const text = (d.annotationText as string) ?? "";
          const comment = (d.annotationComment as string) ?? "";
          const page = (d.annotationPageLabel as string) ?? "";
          const color = (d.annotationColor as string) ?? "";

          const parts: string[] = [];
          if (text) parts.push(`> ${text}`);
          if (comment) parts.push(comment);
          const meta: string[] = [];
          if (page) meta.push(`p. ${page}`);
          if (color) meta.push(color);
          if (meta.length > 0) parts.push(`*(${meta.join(", ")})*`);

          sections.push(parts.join("\n"));
          sections.push("");
        }
      }

      return {
        content: [{ type: "text", text: sections.join("\n") }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error fetching notes: ${error}` }],
        isError: true,
      };
    }
  }
);

// ──────────────────────────────────────────
// Tool: zotero_get_attachments
// ──────────────────────────────────────────
server.tool(
  "zotero_get_attachments",
  "Get file attachments (PDFs, etc.) for a Zotero item. Returns filenames, file paths, content types, and link modes.",
  {
    key: z.string().describe("Zotero item key (e.g. 'ABC12345')"),
  },
  async ({ key }) => {
    try {
      const children = await client.getItemChildren(key);
      const attachments = children.filter(
        (c) => c.data.itemType === "attachment"
      );

      if (attachments.length === 0) {
        return {
          content: [
            { type: "text", text: `No attachments found for item \`${key}\`.` },
          ],
        };
      }

      const lines: string[] = [`## Attachments (${attachments.length})\n`];
      for (const att of attachments) {
        const d = att.data;
        const parts: string[] = [];
        parts.push(`**${d.filename ?? d.title ?? "Untitled"}**`);
        if (d.contentType) parts.push(`Type: ${d.contentType}`);
        if (d.linkMode) parts.push(`Link mode: ${d.linkMode}`);
        if (d.path) parts.push(`Path: ${d.path}`);
        if (d.url) parts.push(`URL: ${d.url}`);
        parts.push(`Key: \`${d.key}\``);
        lines.push(parts.join("\n"));
        lines.push("");
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error fetching attachments: ${error}` }],
        isError: true,
      };
    }
  }
);

// ──────────────────────────────────────────
// Tool: zotero_cite_stub
// ──────────────────────────────────────────
server.tool(
  "zotero_cite_stub",
  `Generate validated citation stubs for use in documents. Each stub references a real Zotero item — if any key doesn't exist, the tool returns an error. Use these stubs in .docx documents; the user runs a Word macro to convert them into live Zotero citations.

Stub format:
  {{CITE:KEY}} — simple citation
  {{CITE:KEY|p=42}} — with page locator
  {{CITE:KEY1;KEY2}} — grouped (multiple sources, one claim)
  {{CITE:KEY|prefix=see |suffix=, emphasis added}} — with prefix/suffix
  {{CITE:KEY|suppress-author}} — for narrative citations like "Brandom (2019) argues..."
  {{BIBLIOGRAPHY}} — bibliography placeholder (place at end of document)

IMPORTANT: Always call this tool to get stubs instead of writing them by hand. This validates that every key exists in the user's Zotero library, preventing hallucinated references.`,
  {
    citations: z
      .array(
        z.object({
          keys: z.array(z.string()).min(1).describe("Zotero item key(s). Multiple keys = grouped citation."),
          locator: z.string().optional().describe("Page or locator (e.g. '42', '§3.2', 'ch. 5')"),
          prefix: z.string().optional().describe("Text before citation (e.g. 'see ')"),
          suffix: z.string().optional().describe("Text after citation (e.g. ', emphasis added')"),
          suppressAuthor: z.boolean().optional().describe("Suppress author for narrative citations"),
        })
      )
      .min(1)
      .describe("Array of citations to generate stubs for"),
    bibliography: z
      .boolean()
      .optional()
      .describe("If true, also include a {{BIBLIOGRAPHY}} stub"),
    bibliographyStyle: z
      .string()
      .optional()
      .describe("CSL style for bibliography (e.g. 'chicago-author-date'). Default: apa"),
  },
  async ({ citations, bibliography, bibliographyStyle }) => {
    try {
      // Validate all keys exist
      const allKeys = [...new Set(citations.flatMap((c) => c.keys))];
      const items = await client.getItems(allKeys);
      const foundKeys = new Set(items.map((i) => i.key));
      const missingKeys = allKeys.filter((k) => !foundKeys.has(k));

      if (missingKeys.length > 0) {
        return {
          content: [
            {
              type: "text",
              text: `Error: The following Zotero item keys were not found in the library: ${missingKeys.join(", ")}. Use zotero_search to find valid keys.`,
            },
          ],
          isError: true,
        };
      }

      // Build stubs
      const stubs: string[] = [];
      for (const cit of citations) {
        const keyPart = cit.keys.join(";");
        const opts: string[] = [];
        if (cit.locator) opts.push(`p=${cit.locator}`);
        if (cit.prefix) opts.push(`prefix=${cit.prefix}`);
        if (cit.suffix) opts.push(`suffix=${cit.suffix}`);
        if (cit.suppressAuthor) opts.push("suppress-author");
        const optsPart = opts.length > 0 ? "|" + opts.join("|") : "";
        stubs.push(`{{CITE:${keyPart}${optsPart}}}`);
      }

      // Build a readable summary for each citation
      const lines: string[] = ["## Citation Stubs\n"];
      for (let i = 0; i < citations.length; i++) {
        const cit = citations[i];
        const citItems = cit.keys.map((k) => items.find((it) => it.key === k)!);
        const desc = citItems
          .map((it) => {
            const author = it.data.creators?.[0]?.lastName ?? "Unknown";
            const year = it.data.date?.match(/\d{4}/)?.[0] ?? "n.d.";
            return `${author} ${year}`;
          })
          .join("; ");
        lines.push(`**${desc}**: \`${stubs[i]}\``);
      }

      if (bibliography) {
        const bibStub = bibliographyStyle
          ? `{{BIBLIOGRAPHY|style=${bibliographyStyle}}}`
          : "{{BIBLIOGRAPHY}}";
        lines.push(`\n**Bibliography**: \`${bibStub}\``);
        stubs.push(bibStub);
      }

      lines.push("\n---\n");
      lines.push("Copy these stubs into your document. After saving as .docx, run the **Process Citation Stubs** macro in Word to convert them to live Zotero citations.");

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error generating stubs: ${error}` }],
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

  // Non-blocking health check
  client.testConnection().then((ok) => {
    if (ok) {
      console.error("Zotero connection verified.");
    } else {
      console.error(
        "Warning: Could not reach Zotero. Tools will fail until Zotero is available."
      );
    }
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
