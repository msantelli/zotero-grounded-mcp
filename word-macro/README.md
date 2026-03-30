# Word Macro: Process Citation Stubs

This VBA macro converts `{{CITE:...}}` stubs in a Word document into live Zotero citations. After running it, click **Zotero > Refresh** to format the citations.

## Installation

### Option A: Import the macro (quickest)

1. Open Word
2. Press **Alt+F11** to open the VBA Editor
3. Right-click **Normal** in the Project panel on the left
4. Click **Import File...**
5. Select `ProcessCitationStubs.bas`
6. Close the VBA Editor

The macro is now available in all documents. Run it via **Alt+F8** > `ProcessCitationStubs`.

### Option B: Add a toolbar button (permanent)

After importing the macro:

1. Right-click the Word ribbon > **Customize the Ribbon...**
2. Under "Choose commands from", select **Macros**
3. Find `ProcessCitationStubs` and add it to a ribbon group
4. Rename it to something friendly like "Process Zotero Stubs"

## Requirements

- **Zotero desktop** must be running (the macro calls its local API on port 23119)
- **Zotero Word plugin** must be installed (for Refresh to work after conversion)
- **Macros must be enabled** in Word's Trust Center settings

## Stub format

The stubs that Claude generates look like this:

```
Regular citation:        {{CITE:4XD6XSLU|lib=user:1234567}}
With page:               {{CITE:4XD6XSLU|lib=user:1234567|p=42}}
Grouped (multi-source):  {{CITE:4XD6XSLU;Z2JEL4W2|lib=group:98765}}
With prefix/suffix:      {{CITE:4XD6XSLU|lib=user:1234567|p=42|prefix=see%20|suffix=%2C%20emphasis%20added}}
Narrative (no author):   {{CITE:4XD6XSLU|lib=user:1234567|suppress-author}}
Bibliography:            {{BIBLIOGRAPHY|lib=user:1234567|style=chicago-author-date}}
```

Notes:

- `lib=user:...` and `lib=group:...` tell the macro which Zotero library to query and which Zotero URI to emit.
- `p=`, `prefix=`, and `suffix=` are percent-encoded so reserved characters like `|` and `;` survive round-tripping.
- Older stubs without `lib=` still work for personal libraries, but new stubs should always come from `zotero_cite_stub`.

## Workflow

1. Ask Claude to write a document using your Zotero references
2. Claude uses `zotero_cite_stub` to generate validated stubs
3. Save the document as .docx
4. Open in Word, run the macro (Alt+F8 > ProcessCitationStubs)
5. Click **Zotero > Refresh** in the Word toolbar
6. Done — all citations are live and reformattable

## Manual verification checklist

Use this after changing either the MCP tool or the macro:

1. Personal library: `{{CITE:KEY|lib=user:...}}` converts and refreshes.
2. Group library: `{{CITE:KEY|lib=group:...}}` converts and refreshes.
3. Bibliography style: `{{BIBLIOGRAPHY|lib=user:...|style=mla}}` sets document style to MLA after Refresh.
4. Escaping: prefix/suffix/locator values containing spaces, `|`, and `;` survive conversion.
