export const bibliographyStyleUrls = {
  apa: "http://www.zotero.org/styles/apa",
  "chicago-author-date": "http://www.zotero.org/styles/chicago-author-date",
  mla: "http://www.zotero.org/styles/modern-language-association",
  ieee: "http://www.zotero.org/styles/ieee",
  harvard: "http://www.zotero.org/styles/harvard-cite-them-right",
} as const;

export type SupportedBibliographyStyle = keyof typeof bibliographyStyleUrls;

export type LibraryContext =
  | { type: "user"; userId: string }
  | { type: "group"; groupId: string };

export interface CitationStubInput {
  keys: string[];
  locator?: string;
  prefix?: string;
  suffix?: string;
  suppressAuthor?: boolean;
}

export function isSupportedBibliographyStyle(
  style: string
): style is SupportedBibliographyStyle {
  return style in bibliographyStyleUrls;
}

export function bibliographyStyleToUrl(
  style: SupportedBibliographyStyle
): string {
  return bibliographyStyleUrls[style];
}

export function serializeLibraryContext(context: LibraryContext): string {
  return context.type === "group"
    ? `group:${context.groupId}`
    : `user:${context.userId}`;
}

export function buildCitationStub(
  citation: CitationStubInput,
  libraryContext: LibraryContext
): string {
  const opts: string[] = [`lib=${serializeLibraryContext(libraryContext)}`];
  if (citation.locator) opts.push(`p=${encodeStubValue(citation.locator)}`);
  if (citation.prefix) opts.push(`prefix=${encodeStubValue(citation.prefix)}`);
  if (citation.suffix) opts.push(`suffix=${encodeStubValue(citation.suffix)}`);
  if (citation.suppressAuthor) opts.push("suppress-author");

  return `{{CITE:${citation.keys.join(";")}|${opts.join("|")}}}`;
}

export function buildBibliographyStub(
  libraryContext: LibraryContext,
  style?: SupportedBibliographyStyle
): string {
  const opts = [`lib=${serializeLibraryContext(libraryContext)}`];
  if (style) opts.push(`style=${style}`);
  return `{{BIBLIOGRAPHY|${opts.join("|")}}}`;
}

function encodeStubValue(value: string): string {
  return encodeURIComponent(value);
}
