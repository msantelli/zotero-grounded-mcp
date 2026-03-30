/**
 * Citation formatter — delegates to citeproc-js when CSL-JSON is available,
 * falls back to a simplified Chicago-style formatter otherwise.
 */

import type { ZoteroItem } from "./zotero-client.js";
import { getEngine } from "./citation-engine.js";

/**
 * Format a single item as a short inline citation: (Author Year)
 * Uses citeproc when CSL-JSON is available.
 */
export function formatInlineCitation(
  item: ZoteroItem,
  style: string = "chicago-author-date"
): string {
  if (item.csljson) {
    try {
      const csl = { ...item.csljson, id: String(item.csljson.id ?? item.key) };
      const engine = getEngine(style);
      engine.registerItems([csl]);
      return engine.makeCitation([String(csl.id)]);
    } catch {
      // Fall through to simple formatter
    }
  }
  return simpleInlineCitation(item);
}

/**
 * Format a single item as a full bibliography entry.
 * Uses citeproc when CSL-JSON is available.
 */
export function formatBibliographyEntry(
  item: ZoteroItem,
  style: string = "chicago-author-date"
): string {
  if (item.csljson) {
    try {
      const csl = { ...item.csljson, id: String(item.csljson.id ?? item.key) };
      const engine = getEngine(style);
      engine.registerItems([csl]);
      const entries = engine.makeBibliography();
      if (entries.length > 0) return entries[0];
    } catch {
      // Fall through to simple formatter
    }
  }
  return simpleBibliographyEntry(item);
}

/**
 * Format a full bibliography from multiple items, sorted alphabetically.
 * Uses citeproc when CSL-JSON is available.
 */
export function formatBibliography(
  items: ZoteroItem[],
  style: string = "chicago-author-date"
): string {
  // Try citeproc for all items that have CSL-JSON
  const withCsl = items.filter((i) => i.csljson);
  const withoutCsl = items.filter((i) => !i.csljson);

  const entries: string[] = [];

  if (withCsl.length > 0) {
    try {
      const engine = getEngine(style);
      const cslItems = withCsl.map((item) => ({
        ...item.csljson!,
        id: String(item.csljson!.id ?? item.key),
      }));
      engine.registerItems(cslItems);
      entries.push(...engine.makeBibliography());
    } catch {
      // Fall back to simple for all
      entries.push(...withCsl.map((item) => simpleBibliographyEntry(item)));
    }
  }

  // Simple formatter for items without CSL-JSON
  entries.push(...withoutCsl.map((item) => simpleBibliographyEntry(item)));

  return entries.sort((a, b) => a.localeCompare(b)).join("\n\n");
}

// --- Simple (fallback) formatters ---

function simpleInlineCitation(item: ZoteroItem): string {
  const firstAuthor = item.data.creators?.[0];
  const authorStr = firstAuthor
    ? firstAuthor.lastName ?? firstAuthor.name ?? "Unknown"
    : "Unknown";
  const year = extractYear(item.data.date);
  const etAl = (item.data.creators?.length ?? 0) > 2 ? " et al." : "";
  return `(${authorStr}${etAl} ${year})`;
}

function simpleBibliographyEntry(item: ZoteroItem): string {
  const authors = formatAuthors(item.data.creators ?? []);
  const year = extractYear(item.data.date);
  const title = item.data.title ?? "Untitled";

  switch (item.data.itemType) {
    case "journalArticle": {
      const journal = item.data.publicationTitle ?? "";
      const vol = item.data.volume ? `, ${item.data.volume}` : "";
      const issue = item.data.issue ? `(${item.data.issue})` : "";
      const pages = item.data.pages ? `, ${item.data.pages}` : "";
      const doi = item.data.DOI ? `. https://doi.org/${item.data.DOI}` : "";
      return `${authors} (${year}). "${title}." *${journal}*${vol}${issue}${pages}${doi}.`;
    }

    case "book": {
      const publisher = item.data.publisher ?? "";
      const place = item.data.place ? `${item.data.place}: ` : "";
      return `${authors} (${year}). *${title}*. ${place}${publisher}.`;
    }

    case "bookSection": {
      const bookTitle = item.data.bookTitle ?? "";
      const publisher = item.data.publisher ?? "";
      const pages = item.data.pages ? `, ${item.data.pages}` : "";
      return `${authors} (${year}). "${title}." In *${bookTitle}*${pages}. ${publisher}.`;
    }

    case "conferencePaper": {
      const procTitle = item.data.proceedingsTitle ?? "";
      return `${authors} (${year}). "${title}." In *${procTitle}*.`;
    }

    case "thesis": {
      const uni = item.data.publisher ?? "";
      return `${authors} (${year}). *${title}* (Thesis). ${uni}.`;
    }

    default: {
      const publisher = item.data.publisher ? `. ${item.data.publisher}` : "";
      return `${authors} (${year}). "${title}"${publisher}.`;
    }
  }
}

// --- Helpers ---

function formatAuthors(
  creators: Array<{
    creatorType: string;
    firstName?: string;
    lastName?: string;
    name?: string;
  }>
): string {
  const authors = creators.filter(
    (c) => c.creatorType === "author" || c.creatorType === "editor"
  );
  if (authors.length === 0) return "Unknown";

  const names = authors.map((a) => {
    if (a.name) return a.name;
    return `${a.lastName ?? ""}${a.firstName ? `, ${a.firstName}` : ""}`;
  });

  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]} et al.`;
}

function extractYear(date?: string): string {
  if (!date) return "n.d.";
  const match = date.match(/(\d{4})/);
  return match ? match[1] : "n.d.";
}
