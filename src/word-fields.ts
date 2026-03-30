/**
 * Zotero Word field code XML generators.
 *
 * Produces the exact XML that Zotero's Word plugin uses for citations,
 * bibliographies, and document preferences. When injected into a .docx,
 * the Zotero plugin recognizes these as its own and can Refresh/reformat them.
 */

import type { ZoteroItem } from "./zotero-client.js";

// ── Helpers ──────────────────────────────────────────

/** Generate a random 8-char alphanumeric citation ID (matches Zotero's format). */
function generateCitationId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * Convert a Zotero item key to a deterministic numeric ID.
 * Zotero's Word plugin uses SQLite row IDs internally, but matches by URI —
 * so this placeholder works fine and gets normalized on first Refresh.
 */
export function keyToNumericId(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build a simple "(Author, Year)" display string from CSL-JSON.
 * This is a placeholder — Zotero replaces it on Refresh.
 */
export function buildDisplayText(csljson: Record<string, unknown>): string {
  const authors = csljson.author as
    | Array<{ family?: string; given?: string }>
    | undefined;
  const issued = csljson.issued as
    | { "date-parts"?: number[][] }
    | undefined;
  const year = issued?.["date-parts"]?.[0]?.[0] ?? "n.d.";

  if (!authors || authors.length === 0) {
    const title = (csljson.title as string) ?? "Unknown";
    const short = title.length > 30 ? title.slice(0, 30) + "…" : title;
    return `(${short}, ${year})`;
  }

  let authorStr: string;
  if (authors.length === 1) {
    authorStr = authors[0].family ?? "Unknown";
  } else if (authors.length === 2) {
    authorStr = `${authors[0].family} & ${authors[1].family}`;
  } else {
    authorStr = `${authors[0].family} et al.`;
  }

  return `(${authorStr}, ${year})`;
}

// ── XML Builders ─────────────────────────────────────

export interface FieldCodeOptions {
  userId: string;
  styleUrl?: string;
  locator?: string;
  locatorLabel?: string;
  prefix?: string;
  suffix?: string;
  suppressAuthor?: boolean;
}

/**
 * Build the Word XML for a Zotero citation field code.
 * Produces the five XML elements (begin, instrText, separate, display, end)
 * that go inside a <w:p> element in document.xml.
 */
export function buildFieldCodeXml(
  items: Array<{
    item: ZoteroItem;
    locator?: string;
    prefix?: string;
    suffix?: string;
    suppressAuthor?: boolean;
  }>,
  options: FieldCodeOptions
): string {
  const citationId = generateCitationId();

  const citationItems = items.map(
    ({ item, locator, prefix, suffix, suppressAuthor }) => {
      const csljson = item.csljson ?? {};
      const key = item.data.key;
      const uri = `http://zotero.org/users/${options.userId}/items/${key}`;

      const citItem: Record<string, unknown> = {
        id: keyToNumericId(key),
        uris: [uri],
        itemData: csljson,
      };

      if (locator ?? options.locator) citItem.locator = locator ?? options.locator;
      if (options.locatorLabel) citItem.label = options.locatorLabel;
      if (prefix ?? options.prefix) citItem.prefix = prefix ?? options.prefix;
      if (suffix ?? options.suffix) citItem.suffix = suffix ?? options.suffix;
      if (suppressAuthor ?? options.suppressAuthor) citItem["suppress-author"] = true;

      return citItem;
    }
  );

  const displayParts = items.map(({ item }) => buildDisplayText(item.csljson ?? {}));
  const displayText =
    displayParts.length === 1
      ? displayParts[0]
      : "(" + displayParts.map((d) => d.slice(1, -1)).join("; ") + ")";

  const cslCitation = {
    citationID: citationId,
    properties: {
      unsorted: false,
      formattedCitation: displayText,
      plainCitation: displayText,
      noteIndex: 0,
    },
    citationItems,
    schema: "https://github.com/citation-style-language/schema/raw/master/csl-citation.json",
  };

  const jsonStr = JSON.stringify(cslCitation);
  const escapedJson = escapeXml(jsonStr);

  return [
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r>`,
    `<w:r><w:instrText xml:space="preserve"> ADDIN ZOTERO_ITEM CSL_CITATION ${escapedJson} </w:instrText></w:r>`,
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>`,
    `<w:r><w:t>${escapeXml(displayText)}</w:t></w:r>`,
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>`,
  ].join("");
}

/**
 * Build the Word XML for a Zotero bibliography field code.
 * Place where the bibliography should appear. Zotero populates it on Refresh.
 */
export function buildBibliographyFieldXml(): string {
  return [
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r>`,
    `<w:r><w:instrText xml:space="preserve"> ADDIN ZOTERO_BIBL {"uncited":[],"omitted":[],"custom":[]} CSL_BIBLIOGRAPHY </w:instrText></w:r>`,
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>`,
    `<w:r><w:t>[Bibliography will appear here after Zotero Refresh]</w:t></w:r>`,
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>`,
  ].join("");
}

/**
 * Build docProps/custom.xml content with Zotero preferences.
 * Tells the Zotero Word plugin which CSL style and locale to use.
 */
export function buildZoteroPrefsXml(
  styleId: string = "http://www.zotero.org/styles/apa",
  locale: string = "en-US"
): string {
  const prefData =
    `&lt;data data-version=&quot;3&quot; zotero-version=&quot;7.0.0&quot;&gt;` +
    `&lt;session id=&quot;${generateCitationId()}&quot;/&gt;` +
    `&lt;style id=&quot;${styleId}&quot; locale=&quot;${locale}&quot; hasBibliography=&quot;1&quot; bibliographyStyleHasBeenSet=&quot;0&quot;/&gt;` +
    `&lt;prefs&gt;` +
    `&lt;pref name=&quot;fieldType&quot; value=&quot;Field&quot;/&gt;` +
    `&lt;pref name=&quot;automaticJournalAbbreviations&quot; value=&quot;true&quot;/&gt;` +
    `&lt;/prefs&gt;` +
    `&lt;/data&gt;`;

  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties"`,
    `  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">`,
    `  <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="ZOTERO_PREF_1">`,
    `    <vt:lpwstr>${prefData}</vt:lpwstr>`,
    `  </property>`,
    `</Properties>`,
  ].join("\n");
}
