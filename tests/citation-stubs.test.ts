import { describe, expect, it } from "vitest";
import {
  bibliographyStyleToUrl,
  buildBibliographyStub,
  buildCitationStub,
  isSupportedBibliographyStyle,
} from "../src/citation-stubs.js";

describe("citation stubs", () => {
  it("builds a user-library citation stub with encoded values", () => {
    const stub = buildCitationStub(
      {
        keys: ["ABCD1234", "EFGH5678"],
        locator: "42|43",
        prefix: "see ",
        suffix: ", emphasis added",
        suppressAuthor: true,
      },
      { type: "user", userId: "12345" }
    );

    expect(stub).toBe(
      "{{CITE:ABCD1234;EFGH5678|lib=user:12345|p=42%7C43|prefix=see%20|suffix=%2C%20emphasis%20added|suppress-author}}"
    );
  });

  it("builds a group-library citation stub", () => {
    const stub = buildCitationStub(
      {
        keys: ["ABCD1234"],
      },
      { type: "group", groupId: "67890" }
    );

    expect(stub).toBe("{{CITE:ABCD1234|lib=group:67890}}");
  });

  it("builds a bibliography stub with style and library context", () => {
    const stub = buildBibliographyStub(
      { type: "group", groupId: "67890" },
      "chicago-author-date"
    );

    expect(stub).toBe(
      "{{BIBLIOGRAPHY|lib=group:67890|style=chicago-author-date}}"
    );
  });

  it("validates supported bibliography styles", () => {
    expect(isSupportedBibliographyStyle("apa")).toBe(true);
    expect(isSupportedBibliographyStyle("mla")).toBe(true);
    expect(isSupportedBibliographyStyle("unknown")).toBe(false);
  });

  it("maps style names to Zotero URLs", () => {
    expect(bibliographyStyleToUrl("apa")).toBe(
      "http://www.zotero.org/styles/apa"
    );
    expect(bibliographyStyleToUrl("harvard")).toBe(
      "http://www.zotero.org/styles/harvard-cite-them-right"
    );
  });
});
