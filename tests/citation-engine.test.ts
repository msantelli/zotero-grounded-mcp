import { describe, it, expect } from "vitest";
import { CitationEngine, getEngine } from "../src/citation-engine.js";

describe("CitationEngine", () => {
  it("creates an engine with chicago-author-date style", () => {
    const engine = getEngine("chicago-author-date");
    expect(engine).toBeInstanceOf(CitationEngine);
  });

  it("throws for unknown style", () => {
    expect(() => getEngine("nonexistent-style")).toThrow("Unknown CSL style");
  });

  it("generates an inline citation", () => {
    const engine = getEngine();
    engine.registerItems([
      {
        id: "test1",
        type: "article-journal",
        title: "Test Article",
        author: [{ family: "Smith", given: "John" }],
        issued: { "date-parts": [[2020]] },
        "container-title": "Test Journal",
      },
    ]);
    const citation = engine.makeCitation(["test1"]);
    expect(citation).toContain("Smith");
    expect(citation).toContain("2020");
  });

  it("generates a bibliography entry for a journal article", () => {
    const engine = getEngine();
    engine.registerItems([
      {
        id: "art1",
        type: "article-journal",
        title: "Inference and Meaning",
        author: [{ family: "Brandom", given: "Robert" }],
        issued: { "date-parts": [[2000]] },
        "container-title": "Philosophy Quarterly",
        volume: "50",
        page: "123-145",
      },
    ]);
    const entries = engine.makeBibliography();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toContain("Brandom");
    expect(entries[0]).toContain("2000");
    expect(entries[0]).toContain("Inference and Meaning");
  });

  it("generates a bibliography for a book", () => {
    const engine = getEngine();
    engine.registerItems([
      {
        id: "book1",
        type: "book",
        title: "A Spirit of Trust",
        author: [{ family: "Brandom", given: "Robert" }],
        issued: { "date-parts": [[2019]] },
        publisher: "Harvard University Press",
        "publisher-place": "Cambridge, MA",
      },
    ]);
    const entries = engine.makeBibliography();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toContain("Spirit of Trust");
    expect(entries[0]).toContain("Harvard");
  });

  it("handles multiple items in a citation cluster", () => {
    const engine = getEngine();
    engine.registerItems([
      {
        id: "a",
        type: "book",
        title: "Book A",
        author: [{ family: "Alpha", given: "A" }],
        issued: { "date-parts": [[2010]] },
      },
      {
        id: "b",
        type: "book",
        title: "Book B",
        author: [{ family: "Beta", given: "B" }],
        issued: { "date-parts": [[2015]] },
      },
    ]);
    const citation = engine.makeCitation(["a", "b"]);
    expect(citation).toContain("Alpha");
    expect(citation).toContain("Beta");
  });

  it("sorts bibliography entries alphabetically", () => {
    const engine = getEngine();
    engine.registerItems([
      {
        id: "z",
        type: "book",
        title: "Zebra Book",
        author: [{ family: "Zeta", given: "Z" }],
        issued: { "date-parts": [[2020]] },
      },
      {
        id: "a",
        type: "book",
        title: "Alpha Book",
        author: [{ family: "Alpha", given: "A" }],
        issued: { "date-parts": [[2020]] },
      },
    ]);
    const entries = engine.makeBibliography();
    expect(entries).toHaveLength(2);
    // Chicago sorts alphabetically by author
    expect(entries[0]).toContain("Alpha");
    expect(entries[1]).toContain("Zeta");
  });

  it("converts HTML output to markdown", () => {
    const engine = getEngine();
    engine.registerItems([
      {
        id: "t1",
        type: "article-journal",
        title: "Italic Title Test",
        author: [{ family: "Test", given: "A" }],
        issued: { "date-parts": [[2020]] },
        "container-title": "Some Journal",
      },
    ]);
    const entries = engine.makeBibliography();
    // citeproc emits <i> for journal titles; our converter turns them to *...*
    expect(entries[0]).toContain("*Some Journal*");
    // Should not contain raw HTML tags
    expect(entries[0]).not.toContain("<i>");
    expect(entries[0]).not.toContain("</i>");
  });
});
