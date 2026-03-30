# zotero-mcp

An MCP (Model Context Protocol) server that gives Claude access to your Zotero reference library. Claude can search your real references, generate accurate citations, build bibliographies, and read your notes -- no more hallucinated page numbers or wrong years.

## What is an MCP server?

MCP (Model Context Protocol) is a standard that lets AI assistants like Claude call external tools. This project is an MCP **server**: a small program that runs on your machine, connects to your Zotero library, and exposes tools that Claude can use during a conversation.

You don't interact with this server directly. Instead, you configure Claude Code (or another MCP client) to start it automatically. When Claude needs to look up a reference, it calls the tools this server provides.

## Tools provided

| Tool | What it does |
|------|-------------|
| `zotero_search` | Search your library by query, tag, or collection |
| `zotero_get_item` | Get full metadata + formatted citation for an item |
| `zotero_collections` | List all your Zotero collections |
| `zotero_cite` | Generate inline + full citations for given item keys |
| `zotero_bibliography` | Build a sorted Works Cited from item keys |
| `zotero_get_notes` | Get notes and PDF annotations attached to an item |
| `zotero_get_attachments` | Get PDF and file attachments for an item |
| `zotero_cite_stub` | Generate validated citation stubs for .docx documents |

Citation formatting uses **citeproc-js** with the Chicago Author-Date style (18th ed.) by default. The `zotero_cite` and `zotero_bibliography` tools accept an optional `style` parameter.

## Prerequisites

- **Node.js 18+** and **npm** -- check with `node -v` and `npm -v`
- **Zotero desktop app** (for local mode) -- just have it running
- **Claude Code** -- the CLI tool from Anthropic (`npm install -g @anthropic-ai/claude-code`)

## Installation (step by step)

### 1. Clone the project

```bash
git clone <your-repo-url> zotero-mcp
cd zotero-mcp
```

Or if you already have the folder:

```bash
cd zotero-mcp
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build the project

```bash
npm run build
```

This compiles TypeScript to `dist/`. The server runs from `dist/index.js`.

### 4. Register the MCP server with Claude Code

This is the key step. You need to tell Claude Code where to find this server. You have two options:

#### Option A: Using the Claude Code CLI (recommended)

Open a terminal and run:

```bash
claude mcp add zotero node /full/path/to/zotero-mcp/dist/index.js -e ZOTERO_MODE=local
```

Replace `/full/path/to/zotero-mcp` with the actual absolute path to this project. You can find it by running `pwd` inside the project folder.

This registers the server globally so Claude Code can use it in any conversation.

#### Option B: Edit settings.json manually

Open (or create) the file `~/.claude/settings.json` and add:

```json
{
  "mcpServers": {
    "zotero": {
      "command": "node",
      "args": ["/full/path/to/zotero-mcp/dist/index.js"],
      "env": {
        "ZOTERO_MODE": "local"
      }
    }
  }
}
```

Again, replace the path with the real absolute path.

#### Option C: Project-level configuration

If you only want this server available when working inside a specific project, create `.claude/settings.json` in that project's root:

```json
{
  "mcpServers": {
    "zotero": {
      "command": "node",
      "args": ["/full/path/to/zotero-mcp/dist/index.js"],
      "env": {
        "ZOTERO_MODE": "local"
      }
    }
  }
}
```

### 5. Make sure Zotero is running

Open the Zotero desktop app. It exposes a local API on port 23119 automatically -- you don't need to configure anything in Zotero.

### 6. Verify it works

Start Claude Code and ask something like:

> "Search my Zotero library for articles about pragmatism"

If everything is set up correctly, Claude will call the `zotero_search` tool and return results from your actual library. You should see a tool call indicator in the output.

If you see an error like "Could not connect to Zotero", make sure the Zotero desktop app is open.

## Using the web API (no desktop app needed)

If you want to access your library without Zotero running locally (e.g., on a server), use web mode instead:

### 1. Get your API credentials

1. Go to https://www.zotero.org/settings/keys
2. Click "Create new private key"
3. Check "Allow library access" (read-only is fine)
4. Save the key
5. Note your numeric **user ID** shown at the top of the page

### 2. Register with web mode

```bash
claude mcp add zotero node /full/path/to/zotero-mcp/dist/index.js \
  -e ZOTERO_MODE=web \
  -e ZOTERO_USER_ID=your_numeric_id \
  -e ZOTERO_API_KEY=your_api_key
```

Or in `settings.json`:

```json
{
  "mcpServers": {
    "zotero": {
      "command": "node",
      "args": ["/full/path/to/zotero-mcp/dist/index.js"],
      "env": {
        "ZOTERO_MODE": "web",
        "ZOTERO_USER_ID": "your_numeric_id",
        "ZOTERO_API_KEY": "your_api_key"
      }
    }
  }
}
```

## Using a group library

To access a Zotero group library instead of your personal library, add the group config:

```bash
claude mcp add zotero node /full/path/to/zotero-mcp/dist/index.js \
  -e ZOTERO_MODE=local \
  -e ZOTERO_LIBRARY_TYPE=group \
  -e ZOTERO_GROUP_ID=your_group_id
```

You can find the group ID in the URL when you view the group on zotero.org (e.g., `https://www.zotero.org/groups/12345` → group ID is `12345`).

## Using with Claude Cowork (Windows/Mac desktop)

Claude Cowork is Anthropic's agentic AI that runs in a virtual machine on your desktop. It supports MCP servers through the Claude Desktop config -- the server runs on your host machine and Cowork bridges to it automatically.

### 1. Prerequisites

- **Node.js 18+** installed on your machine (not inside the VM) -- download from https://nodejs.org
- **Zotero desktop** running on your machine
- **Claude Desktop** with Cowork access (Pro or Max plan)

### 2. Build the project

Open PowerShell (Windows) or Terminal (Mac):

```bash
cd C:\Users\yourname\zotero-mcp   # or wherever you cloned it
npm install
npm run build
```

### 3. Edit the Claude Desktop config

Open the config file:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`

Add the MCP server (create the file if it doesn't exist):

```json
{
  "mcpServers": {
    "zotero": {
      "command": "node",
      "args": ["C:\\Users\\yourname\\zotero-mcp\\dist\\index.js"],
      "env": {
        "ZOTERO_MODE": "local"
      }
    }
  }
}
```

Replace the path with the actual absolute path to `dist/index.js` on your machine.

### 4. Restart Claude Desktop

Quit and reopen Claude Desktop. The Zotero tools should now appear in Cowork sessions. You can verify by asking Claude to search your library.

**How it works**: The MCP server runs on your host machine (where Node.js and Zotero live). Cowork's VM bridges to it through the desktop config, so you don't need to install anything inside the VM. Zotero must be running on your desktop for local mode to work.

## Configuration reference

| Variable | Default | Description |
|----------|---------|-------------|
| `ZOTERO_MODE` | `local` | `"local"` = Zotero desktop; `"web"` = zotero.org API |
| `ZOTERO_LIBRARY_TYPE` | `user` | `"user"` = personal library; `"group"` = group library |
| `ZOTERO_GROUP_ID` | -- | Numeric group ID (required when `ZOTERO_LIBRARY_TYPE=group`) |
| `ZOTERO_USER_ID` | -- | Your numeric user ID (web mode, user libraries only) |
| `ZOTERO_API_KEY` | -- | API key from zotero.org/settings/keys (web mode only) |
| `ZOTERO_LOCAL_PORT` | `23119` | Port for the local Zotero connector |

## Example workflows

Once connected, you can ask Claude things like:

- *"Search my Zotero for Brandom's work on inferentialism"* -- uses `zotero_search`
- *"Get the full citation for item key ABCD1234"* -- uses `zotero_cite`
- *"Build a bibliography from these 5 items"* -- uses `zotero_bibliography`
- *"What are my notes on this paper?"* -- uses `zotero_get_notes`
- *"Write a literature review paragraph about pragmatism using sources from my library"* -- Claude searches, reads abstracts, and cites accurately

## Privacy and security

This server is **local-first and privacy-respecting**:

- **Local mode**: all data stays on your machine (talks only to `localhost:23119`)
- **Web mode**: talks only to `api.zotero.org` (your own Zotero cloud account)
- **No third-party services**: no data is sent to OpenAI, Google, or any other external API

## Troubleshooting

**"Could not connect to Zotero. Is Zotero desktop running?"**
Open the Zotero desktop app. It needs to be running for local mode to work.

**"Web mode requires userId and apiKey"**
You're in web mode but forgot to set the credentials. Add `ZOTERO_USER_ID` and `ZOTERO_API_KEY` to your MCP server config.

**"Zotero API request timed out"**
The Zotero API didn't respond within 10 seconds. Check your internet connection (web mode) or restart Zotero (local mode).

**Claude doesn't seem to use the Zotero tools**
1. Check that the server is registered: run `claude mcp list` to see configured servers
2. Make sure the path in your config points to the built `dist/index.js`, not `src/index.ts`
3. Try restarting Claude Code after adding the MCP config

**Tools work but citations look plain**
The server uses citeproc-js for proper citation formatting. If an item doesn't have CSL-JSON data from Zotero, it falls back to a simplified format. This is normal for some item types.

## Development

```bash
npm install        # install dependencies
npm run dev        # run with tsx (hot reload, for development)
npm run build      # compile TypeScript to dist/
npm start          # run the compiled server
npm test           # run the test suite (vitest)
```

## Project structure

```
zotero-mcp/
├── src/
│   ├── index.ts             # MCP server entry point, tool definitions
│   ├── zotero-client.ts     # Zotero API client (local + web)
│   ├── formatter.ts         # Citation formatting (citeproc + fallback)
│   ├── citation-engine.ts   # citeproc-js wrapper
│   ├── html-utils.ts        # HTML-to-Markdown converter
│   ├── citeproc.d.ts        # Type declarations for citeproc
│   └── csl/                 # Bundled CSL style and locale data
│       ├── chicago-author-date.ts
│       └── locales-en-US.ts
├── tests/                   # Vitest test suite
├── dist/                    # Compiled output (after npm run build)
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## Remaining TODOs

- [x] ~~Add more CSL styles~~ — APA, MLA, IEEE, Harvard bundled
- [x] ~~Attachment access~~ — `zotero_get_attachments` tool
- [x] ~~Group libraries~~ — `ZOTERO_LIBRARY_TYPE=group` + `ZOTERO_GROUP_ID`
- [x] ~~In-memory cache~~ — 30-minute TTL for item lookups
