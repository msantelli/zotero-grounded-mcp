# zotero-grounded-mcp

An MCP (Model Context Protocol) server that gives any MCP-compatible assistant access to your Zotero reference library. It can search your real references, generate accurate citations, build bibliographies, read your notes, and turn `.docx` citation stubs into live Zotero field codes.

The design goal is conservative: use Zotero as the ground truth for references, rather than giving an agent room to invent sources silently and slip them into your work.

## What is an MCP server?

MCP (Model Context Protocol) is a standard that lets AI assistants call external tools in a consistent way. This project is an MCP **server**: a small program that runs on your machine, connects to your Zotero library, and exposes tools that any MCP-ready client can call.

You usually do not interact with this server directly. Instead, you configure an MCP client to start it automatically. When your assistant needs to look up a reference, validate a citation, or process a `.docx`, it calls the tools this server provides.

## Read-only by design

This server treats [Zotero](https://www.zotero.org/) as a source of truth, not as something the assistant should rewrite. The Zotero-facing operations are read-only:

- search items
- fetch item metadata
- list collections
- read notes and attachments
- format citations and bibliographies from existing Zotero items

The server does **not** create, edit, move, or delete Zotero library items. The only write operation in the overall workflow is on your local `.docx` output when `zotero_process_docx` converts validated stubs into Zotero field codes.

This is intentional. Many Zotero-related assistant integrations optimize for broad library automation. This project prioritizes verification instead: the assistant should have to cite what is actually in Zotero, so your bibliography is anchored to records you already control.

## Works with any MCP-ready client

This server is not specific to Claude Cowork. It works with any MCP-ready system that can launch a stdio MCP server, including:

- Claude Code
- Claude Desktop / Cowork
- custom MCP clients
- editor integrations or agent frameworks that support MCP

The only requirement is that the client can start:

```bash
node /full/path/to/zotero-grounded-mcp/dist/index.js
```

with the appropriate environment variables.

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
| `zotero_process_docx` | Convert stubs in a .docx into live Zotero field codes |

Citation formatting uses **citeproc-js** with the Chicago Author-Date style (18th ed.) by default. The `zotero_cite` and `zotero_bibliography` tools accept an optional `style` parameter.

## Prerequisites

- **Node.js 18+** and **npm** -- check with `node -v` and `npm -v`
- **Zotero desktop app** (for local mode) -- download from [zotero.org](https://www.zotero.org/)
- **An MCP-compatible client** -- Claude Code, Claude Desktop / Cowork, or any other MCP-ready system

## Installation (step by step)

### 1. Clone the project

```bash
git clone https://github.com/msantelli/zotero-grounded-mcp.git
cd zotero-grounded-mcp
```

Or if you already have the folder:

```bash
cd zotero-grounded-mcp
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

### 4. Register the MCP server with your MCP client

This is the key step. You need to tell your MCP client where to find this server. In generic terms, the client should launch:

```json
{
  "mcpServers": {
    "zotero": {
      "command": "node",
      "args": ["/full/path/to/zotero-grounded-mcp/dist/index.js"],
      "env": {
        "ZOTERO_MODE": "local"
      }
    }
  }
}
```

Replace the path with the real absolute path to `dist/index.js`.

### 4A. Claude Code example

Open a terminal and run:

```bash
claude mcp add zotero node /full/path/to/zotero-grounded-mcp/dist/index.js -e ZOTERO_MODE=local
```

Replace `/full/path/to/zotero-grounded-mcp` with the actual absolute path to this project. You can find it by running `pwd` inside the project folder.

This registers the server globally so Claude Code can use it in any conversation.

### 4B. Claude Code settings.json example

Open (or create) the file `~/.claude/settings.json` and add:

```json
{
  "mcpServers": {
    "zotero": {
      "command": "node",
      "args": ["/full/path/to/zotero-grounded-mcp/dist/index.js"],
      "env": {
        "ZOTERO_MODE": "local"
      }
    }
  }
}
```

Again, replace the path with the real absolute path.

### 4C. Claude Code project-level configuration

If you only want this server available when working inside a specific project, create `.claude/settings.json` in that project's root:

```json
{
  "mcpServers": {
    "zotero": {
      "command": "node",
      "args": ["/full/path/to/zotero-grounded-mcp/dist/index.js"],
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

Start your MCP client and issue a simple Zotero lookup, for example:

> "Search my Zotero library for articles about pragmatism"

If everything is set up correctly, the client will call `zotero_search` and return results from your actual library. You should see a tool call indicator or MCP tool trace in the client output.

If you see an error like "Could not connect to Zotero", make sure the Zotero desktop app is open.

## Using the web API (no desktop app needed)

If you want to access your library without Zotero running locally (e.g., on a server), use web mode instead:

### 1. Get your API credentials

1. Go to [zotero.org/settings/keys](https://www.zotero.org/settings/keys)
2. Click "Create new private key"
3. Check "Allow library access" (read-only is fine)
4. Save the key
5. Note your numeric **user ID** shown at the top of the page

### 2. Register with web mode

```bash
claude mcp add zotero node /full/path/to/zotero-grounded-mcp/dist/index.js \
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
      "args": ["/full/path/to/zotero-grounded-mcp/dist/index.js"],
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
claude mcp add zotero node /full/path/to/zotero-grounded-mcp/dist/index.js \
  -e ZOTERO_MODE=local \
  -e ZOTERO_LIBRARY_TYPE=group \
  -e ZOTERO_GROUP_ID=your_group_id
```

You can find the group ID in the URL when you view the group on zotero.org (e.g., `https://www.zotero.org/groups/12345` → group ID is `12345`).

## Claude Cowork example (Windows/Mac desktop)

Claude Cowork is one example of an MCP-capable environment. It runs in a virtual machine on your desktop, while this server runs on the host machine and is exposed through the Claude Desktop config.

### 1. Prerequisites

- **Node.js 18+** installed on your machine (not inside the VM) -- download from https://nodejs.org
- **Zotero desktop** running on your machine
- **Claude Desktop** with Cowork access (Pro or Max plan)

### 2. Build the project

Open PowerShell (Windows) or Terminal (Mac):

```bash
cd C:\Users\yourname\zotero-grounded-mcp   # or wherever you cloned it
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
      "args": ["C:\\Users\\yourname\\zotero-grounded-mcp\\dist\\index.js"],
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

## Using drafts to produce Zotero-ready `.docx` files

This is the main workflow for turning an existing draft into a `.docx` with Zotero-managed citations. The key idea is not "have the assistant invent a paper from scratch" (which is not generally a good idea), but "take an existing draft in another format (like .md, .txt, or even a rough .docx), find the correct references in Zotero, insert validated stubs, and then convert those stubs into Zotero field codes".

This workflow is tied to Zotero's official [Word Processor Plugins](https://www.zotero.org/support/word_processor_integration), especially the [Zotero Word Plugin usage guide](https://www.zotero.org/support/word_processor_plugin_usage). In ordinary Zotero usage, those docs describe the commands this MCP is designed to feed into safely:

- **Add/Edit Citation**
- **Add/Edit Bibliography**
- **Document Preferences**
- **Refresh**
- **Unlink Citations**

### How it works

```
Your draft (.md, .txt, pasted text, or a rough .docx source)
    |
    v
Your MCP client + zotero-grounded-mcp
    |  1. Searches your Zotero library (zotero_search)
    |  2. Reads abstracts, notes, attachments
    |  3. Matches claims in the draft to real Zotero items
    |  4. Generates validated citation stubs (zotero_cite_stub)
    |  5. Produces a fresh .docx containing those stubs
    v
.docx file with stubs like {{CITE:4XD6XSLU|lib=user:1234567|p=42}}
    |
    v
Your MCP client runs zotero_process_docx
    |  Edits the .docx XML directly: fetches item data from Zotero,
    |  builds the field code structure Zotero's Word integration expects
    v
.docx with live Zotero field codes
    |
    v
Open in Word, click Zotero > Refresh
    |  Zotero formats all citations per your chosen CSL style,
    |  generates the bibliography, and takes ownership
    v
Finished document -- citations are live, reformattable,
and included in Zotero's bibliography management
```

### Step by step

1. **Provide a real draft and ask the assistant to ground it in your Zotero library.** For example:

   > "Take this draft about logical expressivism, find the correct references in my Zotero library, and create a fresh `.docx` with validated Zotero stubs for every citation."

   A good client workflow is:

   - start from a draft you already have
   - ask the assistant to identify which claims need citations
   - ask it to search Zotero for the matching items
   - have it generate a new `.docx` with validated stubs rather than hand-written references

   The resulting draft will contain stubs like:

   ```
   Brandom argues that meaning is constituted by inferential relations
   {{CITE:4XD6XSLU|lib=user:1234567|p=42}}. This builds on earlier work
   {{CITE:Z2JEL4W2;6KQWLXUJ|lib=user:1234567}}.

   {{BIBLIOGRAPHY|lib=user:1234567|style=chicago-author-date}}
   ```

2. **Save or export that result as `.docx`.**

3. **Process the `.docx` through `zotero_process_docx`.** This converts the stubs directly into Zotero field codes inside the `.docx`. No macros or manual XML editing are required.

4. **Open the processed `.docx` in Word** and click **Zotero > Refresh**. This is the same refresh action documented in Zotero's official [Word Plugin usage guide](https://www.zotero.org/support/word_processor_plugin_usage). Zotero formats everything:
   - `{{CITE:4XD6XSLU|lib=user:1234567|p=42}}` becomes `(Brandom, 2019, p. 42)`
   - The bibliography appears at the end with all cited works
   - You can now change citation styles, add references, etc. through Zotero as usual

The important distinction is:

- the assistant helps find and validate the references
- `zotero_cite_stub` ensures the references are real Zotero items
- `zotero_process_docx` converts the stubbed `.docx` into a Zotero-ready `.docx`
- Zotero itself takes ownership after refresh through the normal Word plugin workflow

In other words, this MCP is an on-ramp into Zotero's existing document model, not a parallel citation system.

### Anti-hallucination guardrail

The `zotero_cite_stub` tool **validates every item key for the stubs it generates** against your Zotero library. If the assistant tries to generate a stub for an item that doesn't exist, the tool returns an error:

```
Error: The following Zotero item keys were not found in the library: FAKEKEY99.
Use zotero_search to find valid keys.
```

This does **not** mean the entire document is automatically fabrication-proof. An assistant could still:

- write fake references as plain text,
- hand-write a bogus stub without calling the tool,
- or add claims with no Zotero-backed citation at all.

What the workflow does guarantee is narrower and more useful: citations that go through the validated `zotero_cite_stub` -> `zotero_process_docx` -> Zotero `Refresh` path are grounded in real Zotero items. Fake references outside that path may still appear as ordinary text, but they will not be taken over as Zotero-managed citations.

In practice, that makes Zotero the reference authority for the managed-citation part of the workflow. You should still review the final document for relevance and for any plain-text references the assistant may have added outside the Zotero-managed path.

## Other example workflows

- *"Search my Zotero for Brandom's work on inferentialism"* -- uses `zotero_search`
- *"Get the full citation for item key ABCD1234"* -- uses `zotero_cite`
- *"Build a bibliography from these 5 items"* -- uses `zotero_bibliography`
- *"What are my notes on this paper?"* -- uses `zotero_get_notes`
- *"What PDFs do I have for this item?"* -- uses `zotero_get_attachments`
- *"Take this draft section, find the right Zotero references, and generate a `.docx` with citation stubs"* -- uses `zotero_search`, `zotero_cite_stub`
- *"Process this stubbed `.docx` into a Zotero-ready `.docx`"* -- uses `zotero_process_docx`

## Privacy and security

This server is **local-first and privacy-respecting**:

- **Local mode**: all data stays on your machine (talks only to `localhost:23119`)
- **Web mode**: talks only to `api.zotero.org` and your own [Zotero.org](https://www.zotero.org/) account
- **Read-only Zotero access**: it reads your library metadata but does not modify Zotero records
- **No third-party services**: no data is sent to third parties through the MCP server, there are no more privacy considerations than using a LLM in the cloud in the first place. If you are using a local model, all data stays on your machine.

## Troubleshooting

**"Could not connect to Zotero. Is Zotero desktop running?"**
Open the Zotero desktop app. It needs to be running for local mode to work.

**"Web mode requires userId and apiKey"**
You're in web mode but forgot to set the credentials. Add `ZOTERO_USER_ID` and `ZOTERO_API_KEY` to your MCP server config.

**"Zotero API request timed out"**
The Zotero API didn't respond within 10 seconds. Check your internet connection (web mode) or restart Zotero (local mode).

**My MCP client doesn't seem to use the Zotero tools**
1. Check that the server is registered in your client
2. Make sure the path in your config points to the built `dist/index.js`, not `src/index.ts`
3. Restart the MCP client after adding the config
4. If you are using Claude Code specifically, run `claude mcp list` to inspect configured servers

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
zotero-grounded-mcp/
├── src/
│   ├── index.ts             # MCP server entry point, tool definitions
│   ├── zotero-client.ts     # Zotero API client (local + web)
│   ├── citation-stubs.ts    # .docx stub generation + style validation
│   ├── docx-workflow.ts     # Library-aware .docx orchestration for processing
│   ├── docx-processor.ts   # Post-processes .docx to inject Zotero field codes
│   ├── formatter.ts         # Citation formatting (citeproc + fallback)
│   ├── citation-engine.ts   # citeproc-js wrapper
│   ├── html-utils.ts        # HTML-to-Markdown converter
│   ├── citeproc.d.ts        # Type declarations for citeproc
│   ├── server-version.ts    # package.json version bridge for MCP metadata
│   └── csl/                 # Bundled CSL style and locale data
│       ├── chicago-author-date.ts
│       └── locales-en-US.ts
├── tests/                   # Vitest test suite
├── .github/workflows/       # CI build + test checks
├── dist/                    # Compiled output (after npm run build)
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## License and authorship

This project is released under the MIT License.

Authored by Mauro Santelli, with development help from Claude Opus 4.6 and Codex 5.4.
