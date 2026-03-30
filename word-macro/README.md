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
Regular citation:        {{CITE:4XD6XSLU}}
With page:               {{CITE:4XD6XSLU|p=42}}
Grouped (multi-source):  {{CITE:4XD6XSLU;Z2JEL4W2}}
With prefix/suffix:      {{CITE:4XD6XSLU|p=42|prefix=see |suffix=, emphasis added}}
Narrative (no author):   {{CITE:4XD6XSLU|suppress-author}}
Bibliography:            {{BIBLIOGRAPHY}}
```

## Workflow

1. Ask Claude to write a document using your Zotero references
2. Claude uses `zotero_cite_stub` to generate validated stubs
3. Save the document as .docx
4. Open in Word, run the macro (Alt+F8 > ProcessCitationStubs)
5. Click **Zotero > Refresh** in the Word toolbar
6. Done — all citations are live and reformattable
