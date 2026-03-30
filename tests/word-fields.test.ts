import { describe, it, expect } from "vitest";
import {
  buildFieldCodeXml,
  buildBibliographyFieldXml,
  buildZoteroPrefsXml,
  buildDisplayText,
  keyToNumericId,
} from "../src/word-fields.js";
import { journalArticle, book } from "./fixtures/zotero-responses.js";

describe("keyToNumericId", () => {
  it("returns a positive number", () => {
    expect(keyToNumericId("ABCD1234")).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const a = keyToNumericId("ABCD1234");
    const b = keyToNumericId("ABCD1234");
    expect(a).toBe(b);
  });

  it("produces different IDs for different keys", () => {
    const a = keyToNumericId("ABCD1234");
    const b = keyToNumericId("EFGH5678");
    expect(a).not.toBe(b);
  });
});

describe("buildDisplayText", () => {
  it("formats single author", () => {
    const result = buildDisplayText({
      author: [{ family: "Brandom", given: "Robert" }],
      issued: { "date-parts": [[2008]] },
    });
    expect(result).toBe("(Brandom, 2008)");
  });

  it("formats two authors", () => {
    const result = buildDisplayText({
      author: [
        { family: "Fodor", given: "Jerry" },
        { family: "Lepore", given: "Ernest" },
      ],
      issued: { "date-parts": [[1992]] },
    });
    expect(result).toBe("(Fodor & Lepore, 1992)");
  });

  it("formats three+ authors with et al.", () => {
    const result = buildDisplayText({
      author: [
        { family: "Smith", given: "A" },
        { family: "Jones", given: "B" },
        { family: "Williams", given: "C" },
      ],
      issued: { "date-parts": [[2020]] },
    });
    expect(result).toBe("(Smith et al., 2020)");
  });

  it("uses title when no authors", () => {
    const result = buildDisplayText({
      title: "A Short Title",
      issued: { "date-parts": [[2020]] },
    });
    expect(result).toBe("(A Short Title, 2020)");
  });

  it("handles missing date", () => {
    const result = buildDisplayText({
      author: [{ family: "Brandom" }],
    });
    expect(result).toContain("n.d.");
  });
});

describe("buildFieldCodeXml", () => {
  const options = { userId: "1234567" };

  it("produces XML with begin/separate/end field chars", () => {
    const xml = buildFieldCodeXml(
      [{ item: journalArticle }],
      options
    );
    expect(xml).toContain('w:fldCharType="begin"');
    expect(xml).toContain('w:fldCharType="separate"');
    expect(xml).toContain('w:fldCharType="end"');
  });

  it("contains ADDIN ZOTERO_ITEM instruction", () => {
    const xml = buildFieldCodeXml(
      [{ item: journalArticle }],
      options
    );
    expect(xml).toContain("ADDIN ZOTERO_ITEM CSL_CITATION");
  });

  it("includes the user URI", () => {
    const xml = buildFieldCodeXml(
      [{ item: journalArticle }],
      options
    );
    expect(xml).toContain("zotero.org/users/1234567/items/ABCD1234");
  });

  it("includes display text", () => {
    const xml = buildFieldCodeXml(
      [{ item: journalArticle }],
      options
    );
    // Display text should contain something like (Brandom, 1994)
    expect(xml).toContain("<w:t>");
  });

  it("handles locator option", () => {
    const xml = buildFieldCodeXml(
      [{ item: journalArticle, locator: "108" }],
      options
    );
    expect(xml).toContain("108");
  });

  it("handles grouped citations", () => {
    const xml = buildFieldCodeXml(
      [{ item: journalArticle }, { item: book }],
      options
    );
    // Should contain both items' URIs
    expect(xml).toContain("ABCD1234");
    expect(xml).toContain("EFGH5678");
  });
});

describe("buildBibliographyFieldXml", () => {
  it("produces ZOTERO_BIBL instruction", () => {
    const xml = buildBibliographyFieldXml();
    expect(xml).toContain("ADDIN ZOTERO_BIBL");
    expect(xml).toContain("CSL_BIBLIOGRAPHY");
  });

  it("has begin/separate/end structure", () => {
    const xml = buildBibliographyFieldXml();
    expect(xml).toContain('w:fldCharType="begin"');
    expect(xml).toContain('w:fldCharType="end"');
  });
});

describe("buildZoteroPrefsXml", () => {
  it("produces valid XML with ZOTERO_PREF_1", () => {
    const xml = buildZoteroPrefsXml();
    expect(xml).toContain("ZOTERO_PREF_1");
    expect(xml).toContain('<?xml version="1.0"');
  });

  it("includes the style URL", () => {
    const xml = buildZoteroPrefsXml("http://www.zotero.org/styles/chicago-author-date");
    expect(xml).toContain("chicago-author-date");
  });

  it("defaults to APA", () => {
    const xml = buildZoteroPrefsXml();
    expect(xml).toContain("zotero.org/styles/apa");
  });
});
