/**
 * Citation formatter using CSL (Citation Style Language).
 *
 * Takes CSL-JSON items from Zotero and formats them into human-readable
 * citations and bibliography entries in any CSL style (Chicago, APA, etc.).
 *
 * For a first version we provide a built-in simple formatter.
 * TODO: integrate citeproc-js for full CSL support once the basic MCP works.
 */

import type { ZoteroItem } from "./zotero-client.js";

/**
 * Format a single item as a short inline citation: (Author Year)
 */
export function formatInlineCitation(item: ZoteroItem): string {
  const firstAuthor = item.data.creators?.[0];
  const authorStr = firstAuthor
    ? firstAuthor.lastName ?? firstAuthor.name ?? "Unknown"
    : "Unknown";
  const year = extractYear(item.data.date);
  const etAl = (item.data.creators?.length ?? 0) > 2 ? " et al." : "";
  return `(${authorStr}${etAl} ${year})`;
}

/**
 * Format a single item as a full bibliography entry (Chicago-ish style).
 * This is a simplified formatter; the full citeproc integration will replace it.
 */
export function formatBibliographyEntry(item: ZoteroItem): string {
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
      const bookTitle = (item.data as Record<string, unknown>).bookTitle as string ?? "";
      const publisher = item.data.publisher ?? "";
      const pages = item.data.pages ? `, ${item.data.pages}` : "";
      return `${authors} (${year}). "${title}." In *${bookTitle}*${pages}. ${publisher}.`;
    }

    case "conferencePaper": {
      const procTitle = (item.data as Record<string, unknown>).proceedingsTitle as string ?? "";
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

/**
 * Format a full bibliography from multiple items, sorted by author/year.
 */
export function formatBibliography(items: ZoteroItem[]): string {
  const entries = items
    .map((item) => formatBibliographyEntry(item))
    .sort((a, b) => a.localeCompare(b));
  return entries.join("\n\n");
}

// --- Helpers ---

function formatAuthors(
  creators: Array<{ creatorType: string; firstName?: string; lastName?: string; name?: string }>
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
