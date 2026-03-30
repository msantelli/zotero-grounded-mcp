/**
 * Post-processes a .docx file to replace {{CITE:...}} and {{BIBLIOGRAPHY}}
 * stubs with proper Zotero field code XML.
 *
 * Operates on the .docx as a ZIP archive, editing word/document.xml directly.
 * This bypasses Word's VBA field insertion entirely, producing the exact
 * 5-part XML structure (begin/instrText/separate/result/end) that Zotero
 * expects.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateRawSync, deflateRawSync } from "node:zlib";

// We use Node's built-in zlib + a minimal ZIP implementation
// to avoid adding a dependency. .docx files are ZIP archives.

interface ZipEntry {
  name: string;
  data: Buffer;
}

/**
 * Process a .docx file: replace citation stubs with Zotero field codes.
 *
 * @param inputPath — path to the .docx with stubs
 * @param outputPath — path to write the processed .docx (can be same as input)
 * @param fetchItemJson — callback that fetches CSL-JSON for a given item key and library spec
 * @returns summary of what was processed
 */
export async function processDocxStubs(
  inputPath: string,
  outputPath: string,
  fetchItemJson: (key: string, librarySpec: string) => Promise<{
    cslJson: string;
    numericId: number;
    uri: string;
    displayText: string;
  }>
): Promise<{ citations: number; bibliography: boolean }> {
  const absInput = resolve(inputPath);
  const absOutput = resolve(outputPath);

  // Read the ZIP
  const zipData = readFileSync(absInput);
  const entries = readZip(zipData);

  // Find document.xml
  const docEntry = entries.find(
    (e) => e.name === "word/document.xml"
  );
  if (!docEntry) {
    throw new Error("Not a valid .docx file: word/document.xml not found");
  }

  let xml = docEntry.data.toString("utf-8");
  let citationCount = 0;
  let hasBibliography = false;

  // Process {{BIBLIOGRAPHY...}} first (simpler, no API calls needed)
  const bibRegex = /\{\{BIBLIOGRAPHY[^}]*\}\}/g;
  xml = xml.replace(bibRegex, (match) => {
    hasBibliography = true;

    // Parse style from stub
    let styleUrl = "http://www.zotero.org/styles/apa";
    const styleMatch = match.match(/style=([^|}]+)/);
    if (styleMatch) {
      const styleName = decodeURIComponent(styleMatch[1]);
      const url = styleNameToUrl(styleName);
      if (url) styleUrl = url;
    }

    // Build bibliography field XML
    const instrText = `ADDIN ZOTERO_BIBL {&quot;uncited&quot;:[],&quot;omitted&quot;:[],&quot;custom&quot;:[]} CSL_BIBLIOGRAPHY`;
    const displayText = "[Bibliography — click Zotero &gt; Refresh]";

    return buildFieldXml(instrText, displayText);
  });

  // Process {{CITE:...}} stubs — need async for API calls
  const citeRegex = /\{\{CITE:([^}]+)\}\}/g;
  const citeMatches: Array<{ fullMatch: string; inner: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = citeRegex.exec(xml)) !== null) {
    citeMatches.push({ fullMatch: m[0], inner: m[1] });
  }

  for (const cite of citeMatches) {
    const parts = cite.inner.split("|");
    const keysStr = parts[0];
    const keys = keysStr.split(";");

    let locator = "";
    let prefix = "";
    let suffix = "";
    let suppressAuthor = false;
    let librarySpec = "";

    for (let i = 1; i < parts.length; i++) {
      const opt = parts[i].trim();
      if (opt.startsWith("p=")) {
        locator = decodeURIComponent(opt.slice(2));
      } else if (opt.startsWith("prefix=")) {
        prefix = decodeURIComponent(opt.slice(7));
      } else if (opt.startsWith("suffix=")) {
        suffix = decodeURIComponent(opt.slice(7));
      } else if (opt.startsWith("lib=")) {
        librarySpec = decodeURIComponent(opt.slice(4));
      } else if (opt === "suppress-author") {
        suppressAuthor = true;
      }
    }

    // Build the citation JSON
    const citationId = randomId();
    const citationItems: string[] = [];
    const displayParts: string[] = [];

    for (const key of keys) {
      const trimmedKey = key.trim();
      const itemData = await fetchItemJson(trimmedKey, librarySpec);

      let citItem = `{"id":${itemData.numericId},"uris":["${itemData.uri}"],"itemData":${itemData.cslJson}`;
      if (locator) citItem += `,"locator":"${jsonEscape(locator)}"`;
      if (prefix) citItem += `,"prefix":"${jsonEscape(prefix)}"`;
      if (suffix) citItem += `,"suffix":"${jsonEscape(suffix)}"`;
      if (suppressAuthor) citItem += `,"suppress-author":true`;
      citItem += "}";

      citationItems.push(citItem);
      displayParts.push(itemData.displayText);
    }

    const fullDisplay =
      displayParts.length === 1
        ? displayParts[0]
        : "(" + displayParts.map((d) => d.replace(/^\(|\)$/g, "")).join("; ") + ")";

    const cslCitation =
      `{"citationID":"${citationId}"` +
      `,"properties":{"formattedCitation":"${jsonEscape(fullDisplay)}","plainCitation":"${jsonEscape(fullDisplay)}","noteIndex":0}` +
      `,"citationItems":[${citationItems.join(",")}]` +
      `,"schema":"https://github.com/citation-style-language/schema/raw/master/csl-citation.json"}`;

    const instrText = `ADDIN ZOTERO_ITEM CSL_CITATION ${xmlEscape(cslCitation)}`;
    const fieldXml = buildFieldXml(instrText, xmlEscape(fullDisplay));

    xml = xml.replace(cite.fullMatch, fieldXml);
    citationCount++;
  }

  // Update document.xml in the ZIP entries
  docEntry.data = Buffer.from(xml, "utf-8");

  // Ensure docProps/custom.xml has Zotero prefs
  ensureZoteroPrefs(entries);

  // Write the output
  const output = writeZip(entries);
  writeFileSync(absOutput, output);

  return { citations: citationCount, bibliography: hasBibliography };
}

// ── XML builders ──────────────────────────────────────

function buildFieldXml(instrText: string, displayText: string): string {
  return (
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> ${instrText} </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r><w:t>${displayText}</w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>`
  );
}

function ensureZoteroPrefs(entries: ZipEntry[]): void {
  const customXmlEntry = entries.find(
    (e) => e.name === "docProps/custom.xml"
  );

  const prefData =
    `&lt;data data-version=&quot;3&quot; zotero-version=&quot;7.0.0&quot;&gt;` +
    `&lt;session id=&quot;${randomId()}&quot;/&gt;` +
    `&lt;style id=&quot;http://www.zotero.org/styles/apa&quot; locale=&quot;en-US&quot; hasBibliography=&quot;1&quot; bibliographyStyleHasBeenSet=&quot;0&quot;/&gt;` +
    `&lt;prefs&gt;` +
    `&lt;pref name=&quot;fieldType&quot; value=&quot;Field&quot;/&gt;` +
    `&lt;pref name=&quot;automaticJournalAbbreviations&quot; value=&quot;true&quot;/&gt;` +
    `&lt;/prefs&gt;` +
    `&lt;/data&gt;`;

  if (customXmlEntry) {
    // Add ZOTERO_PREF_1 if not present
    let customXml = customXmlEntry.data.toString("utf-8");
    if (!customXml.includes("ZOTERO_PREF_1")) {
      const insertPoint = customXml.lastIndexOf("</Properties>");
      if (insertPoint > 0) {
        const prop =
          `  <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="ZOTERO_PREF_1">` +
          `<vt:lpwstr>${prefData}</vt:lpwstr></property>\n`;
        customXml =
          customXml.slice(0, insertPoint) + prop + customXml.slice(insertPoint);
        customXmlEntry.data = Buffer.from(customXml, "utf-8");
      }
    }
  }
  // If no custom.xml exists, the prefs will be set on first Zotero Refresh
}

// ── Helpers ───────────────────────────────────────────

function randomId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function keyToNumericId(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function jsonEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function styleNameToUrl(name: string): string | null {
  const map: Record<string, string> = {
    apa: "http://www.zotero.org/styles/apa",
    "chicago-author-date": "http://www.zotero.org/styles/chicago-author-date",
    mla: "http://www.zotero.org/styles/modern-language-association",
    ieee: "http://www.zotero.org/styles/ieee",
    harvard: "http://www.zotero.org/styles/harvard-cite-them-right",
  };
  return map[name.toLowerCase()] ?? null;
}

// ── Minimal ZIP reader/writer ─────────────────────────
// .docx files are standard ZIP archives. We read/write them
// without external dependencies using the ZIP format spec.

function readZip(data: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];

  // Find end-of-central-directory record
  let eocdOffset = -1;
  for (let i = data.length - 22; i >= 0; i--) {
    if (
      data[i] === 0x50 &&
      data[i + 1] === 0x4b &&
      data[i + 2] === 0x05 &&
      data[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("Not a valid ZIP file");

  const cdOffset = data.readUInt32LE(eocdOffset + 16);
  const cdCount = data.readUInt16LE(eocdOffset + 10);

  let pos = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (data.readUInt32LE(pos) !== 0x02014b50) break;

    const compMethod = data.readUInt16LE(pos + 10);
    const compSize = data.readUInt32LE(pos + 20);
    const uncompSize = data.readUInt32LE(pos + 24);
    const nameLen = data.readUInt16LE(pos + 28);
    const extraLen = data.readUInt16LE(pos + 30);
    const commentLen = data.readUInt16LE(pos + 32);
    const localHeaderOffset = data.readUInt32LE(pos + 42);

    const name = data.slice(pos + 46, pos + 46 + nameLen).toString("utf-8");

    // Read from local header to get actual data
    const localPos = localHeaderOffset;
    const localNameLen = data.readUInt16LE(localPos + 26);
    const localExtraLen = data.readUInt16LE(localPos + 28);
    const dataStart = localPos + 30 + localNameLen + localExtraLen;

    let entryData: Buffer;
    if (compMethod === 0) {
      // Stored (no compression)
      entryData = Buffer.from(data.slice(dataStart, dataStart + uncompSize));
    } else if (compMethod === 8) {
      // Deflate
      entryData = inflateRawSync(
        data.slice(dataStart, dataStart + compSize)
      );
    } else {
      // Unsupported compression — keep raw
      entryData = Buffer.from(data.slice(dataStart, dataStart + compSize));
    }

    entries.push({ name, data: entryData });
    pos += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

function writeZip(entries: ZipEntry[]): Buffer {
  const parts: Buffer[] = [];
  const centralDir: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf-8");
    const isStorable =
      entry.name.endsWith("/") || entry.data.length === 0;

    let compData: Buffer;
    let compMethod: number;

    if (isStorable) {
      compData = entry.data;
      compMethod = 0;
    } else {
      compData = deflateRawSync(entry.data);
      compMethod = 8;
      // If deflate is larger, store instead
      if (compData.length >= entry.data.length) {
        compData = entry.data;
        compMethod = 0;
      }
    }

    // Local file header
    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(compMethod, 8); // compression
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    // CRC32
    const crc = crc32(entry.data);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compData.length, 18); // compressed size
    localHeader.writeUInt32LE(entry.data.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuffer.length, 26); // name length
    localHeader.writeUInt16LE(0, 28); // extra length
    nameBuffer.copy(localHeader, 30);

    parts.push(localHeader, compData);

    // Central directory entry
    const cdEntry = Buffer.alloc(46 + nameBuffer.length);
    cdEntry.writeUInt32LE(0x02014b50, 0); // signature
    cdEntry.writeUInt16LE(20, 4); // version made by
    cdEntry.writeUInt16LE(20, 6); // version needed
    cdEntry.writeUInt16LE(0, 8); // flags
    cdEntry.writeUInt16LE(compMethod, 10); // compression
    cdEntry.writeUInt16LE(0, 12); // mod time
    cdEntry.writeUInt16LE(0, 14); // mod date
    cdEntry.writeUInt32LE(crc, 16);
    cdEntry.writeUInt32LE(compData.length, 20);
    cdEntry.writeUInt32LE(entry.data.length, 24);
    cdEntry.writeUInt16LE(nameBuffer.length, 28);
    cdEntry.writeUInt16LE(0, 30); // extra length
    cdEntry.writeUInt16LE(0, 32); // comment length
    cdEntry.writeUInt16LE(0, 34); // disk number
    cdEntry.writeUInt16LE(0, 36); // internal attrs
    cdEntry.writeUInt32LE(0, 38); // external attrs
    cdEntry.writeUInt32LE(offset, 42); // local header offset
    nameBuffer.copy(cdEntry, 46);

    centralDir.push(cdEntry);
    offset += localHeader.length + compData.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const cd of centralDir) {
    parts.push(cd);
    cdSize += cd.length;
  }

  // End of central directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // cd disk
  eocd.writeUInt16LE(entries.length, 8); // entries on disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(cdSize, 12); // cd size
  eocd.writeUInt32LE(cdOffset, 16); // cd offset
  eocd.writeUInt16LE(0, 20); // comment length
  parts.push(eocd);

  return Buffer.concat(parts);
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export { keyToNumericId };
