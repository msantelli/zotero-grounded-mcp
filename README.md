# zotero-mcp

An MCP server that gives Claude access to your Zotero library for searching references, generating citations, and building bibliographies.

## What it does

When connected to Claude Code (or any MCP-compatible client), this server exposes five tools:

| Tool | What it does |
|------|-------------|
| `zotero_search` | Search your library by query, tag, or collection |
| `zotero_get_item` | Get full metadata + formatted citation for an item |
| `zotero_collections` | List all your Zotero collections |
| `zotero_cite` | Generate inline + full citations for given item keys |
| `zotero_bibliography` | Build a sorted Works Cited from item keys |

This means Claude can look up real references from your library instead of writing them from memory — no more invented page numbers or wrong publication years.

## Prerequisites

- **Node.js** 18+ and **npm**
- **Zotero desktop app** (for local mode) — just have it running
- Or a **Zotero Web API key** (for web mode) — get one at https://www.zotero.org/settings/keys

## Setup

```bash
cd zotero-mcp
npm install
npm run build
```

## Configuration

The server reads from environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `ZOTERO_MODE` | `local` | `"local"` = Zotero desktop app; `"web"` = zotero.org API |
| `ZOTERO_USER_ID` | — | Your numeric user ID (web mode only) |
| `ZOTERO_API_KEY` | — | API key from zotero.org/settings/keys (web mode only) |
| `ZOTERO_LOCAL_PORT` | `23119` | Port for the local Zotero connector |

### Local mode (recommended for daily use)

Just have Zotero desktop running. The app exposes a local API on port 23119 by default.

### Web mode

1. Go to https://www.zotero.org/settings/keys
2. Create a new API key with "Allow library access"
3. Note your numeric user ID from the same page
4. Set `ZOTERO_MODE=web`, `ZOTERO_USER_ID=...`, `ZOTERO_API_KEY=...`

## Running

```bash
# Development (with hot reload)
npm run dev

# Production
npm run build
npm start
```

## Connecting to Claude Code

Add this to your Claude Code MCP settings (`.claude/settings.json` or via `claude mcp add`):

```json
{
  "mcpServers": {
    "zotero": {
      "command": "node",
      "args": ["path/to/zotero-mcp/dist/index.js"],
      "env": {
        "ZOTERO_MODE": "local"
      }
    }
  }
}
```

Or using the CLI:

```bash
claude mcp add zotero node path/to/zotero-mcp/dist/index.js -e ZOTERO_MODE=local
```

For web mode:

```bash
claude mcp add zotero node path/to/zotero-mcp/dist/index.js \
  -e ZOTERO_MODE=web \
  -e ZOTERO_USER_ID=your_id \
  -e ZOTERO_API_KEY=your_key
```

## Example workflow

Once connected, you can ask Claude things like:

> "Search my Zotero for Brandom's Making It Explicit and cite it in the document"

Claude will call `zotero_search`, get the real metadata (publisher, year, pages), then use `zotero_cite` to produce an accurate citation — no hallucinated references.

## Project structure

```
zotero-mcp/
├── src/
│   ├── index.ts           # MCP server — tool definitions and handlers
│   ├── zotero-client.ts   # Zotero API client (local + web)
│   └── formatter.ts       # Citation formatting (inline + bibliography)
├── package.json
├── tsconfig.json
└── README.md
```

## Next steps / TODOs for Claude Code

These are good tasks to hand off to Claude Code for further development:

- [ ] **Full CSL support**: Integrate `citeproc-js` to format citations in any CSL style (Chicago, APA, MLA, etc.) instead of the simplified built-in formatter
- [ ] **Notes and annotations**: Add a `zotero_get_notes` tool to retrieve Zotero notes and PDF annotations for an item
- [ ] **Attachment access**: Add a tool to retrieve file paths of PDF attachments
- [ ] **Group libraries**: Support Zotero group libraries in addition to personal ones
- [ ] **Cache layer**: Add a simple in-memory cache to avoid repeated API calls for the same item
- [ ] **Tests**: Add unit tests for the formatter and integration tests against the Zotero API
