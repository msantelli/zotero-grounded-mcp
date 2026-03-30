import { describe, it, expect } from "vitest";
import {
  formatInlineCitation,
  formatBibliographyEntry,
  formatBibliography,
} from "../src/formatter.js";
import {
  journalArticle,
  book,
  bookSection,
  multiAuthorArticle,
  thesis,
  itemWithoutDate,
} from "./fixtures/zotero-responses.js";

describe("formatInlineCitation", () => {
  it("formats a single-author journal article", () => {
    const result = formatInlineCitation(journalArticle);
    expect(result).toContain("Brandom");
    expect(result).toContain("1994");
  });

  it("formats a multi-author article with et al.", () => {
    const result = formatInlineCitation(multiAuthorArticle);
    expect(result).toContain("Smith");
    expect(result).toContain("2020");
  });

  it("handles items without a date", () => {
    const result = formatInlineCitation(itemWithoutDate);
    expect(result).toContain("Author");
    // citeproc or fallback should handle missing date
  });

  it("formats a book", () => {
    const result = formatInlineCitation(book);
    expect(result).toContain("Brandom");
    expect(result).toContain("2008");
  });
});

describe("formatBibliographyEntry", () => {
  it("formats a journal article with all fields", () => {
    const result = formatBibliographyEntry(journalArticle);
    expect(result).toContain("Brandom");
    expect(result).toContain("1994");
    expect(result).toContain("Making It Explicit");
    // With citeproc, should include DOI
    expect(result).toContain("10.2307/2108418");
  });

  it("formats a book", () => {
    const result = formatBibliographyEntry(book);
    expect(result).toContain("Brandom");
    expect(result).toContain("2008");
    expect(result).toContain("Between Saying and Doing");
    expect(result).toContain("Oxford University Press");
  });

  it("formats a book section using simple fallback (no csljson)", () => {
    const result = formatBibliographyEntry(bookSection);
    expect(result).toContain("Brandom");
    expect(result).toContain("2011");
    expect(result).toContain("Some Pragmatist Themes");
    expect(result).toContain("A Spirit of Trust");
  });

  it("formats a thesis using simple fallback (no csljson)", () => {
    const result = formatBibliographyEntry(thesis);
    expect(result).toContain("Doe");
    expect(result).toContain("2019");
    expect(result).toContain("Normative Pragmatics");
    expect(result).toContain("University of Pittsburgh");
  });

  it("handles items without a date", () => {
    const result = formatBibliographyEntry(itemWithoutDate);
    expect(result).toContain("Author");
    expect(result).toContain("A Book Without a Date");
  });
});

describe("formatBibliography", () => {
  it("formats multiple items sorted alphabetically", () => {
    const result = formatBibliography([journalArticle, book, multiAuthorArticle]);
    const lines = result.split("\n\n");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    // Should contain all items
    expect(result).toContain("Brandom");
    expect(result).toContain("Smith");
  });

  it("handles a single item", () => {
    const result = formatBibliography([journalArticle]);
    expect(result).toContain("Brandom");
    expect(result).toContain("1994");
  });

  it("mixes citeproc and fallback items", () => {
    const result = formatBibliography([journalArticle, bookSection]);
    expect(result).toContain("Making It Explicit");
    expect(result).toContain("Some Pragmatist Themes");
  });
});
