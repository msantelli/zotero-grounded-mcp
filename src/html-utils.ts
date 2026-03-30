/**
 * Simple HTML-to-Markdown converter for Zotero notes and citeproc output.
 * Handles common tags found in Zotero HTML content.
 */

export function htmlToMarkdown(html: string): string {
  let text = html;

  // Block-level elements: add newlines
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/div>/gi, "\n");
  text = text.replace(/<\/blockquote>/gi, "\n\n");
  text = text.replace(/<blockquote[^>]*>/gi, "> ");

  // Headings
  text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n");
  text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n");
  text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n");
  text = text.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n\n");
  text = text.replace(/<h5[^>]*>(.*?)<\/h5>/gi, "##### $1\n\n");
  text = text.replace(/<h6[^>]*>(.*?)<\/h6>/gi, "###### $1\n\n");

  // Inline formatting
  text = text.replace(/<(b|strong)[^>]*>(.*?)<\/(b|strong)>/gi, "**$2**");
  text = text.replace(/<(i|em)[^>]*>(.*?)<\/(i|em)>/gi, "*$2*");

  // Links
  text = text.replace(/<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");

  // Lists
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");
  text = text.replace(/<\/?[ou]l[^>]*>/gi, "\n");

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, " ");

  // Clean up excessive whitespace
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}
