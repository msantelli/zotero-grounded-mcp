import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processDocxStubs, readZip } from "../src/docx-processor.js";

const tmpPaths: string[] = [];

afterEach(() => {
  for (const path of tmpPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("docx processor", () => {
  it("writes the bibliography style into custom.xml and preserves Zotero field structure", async () => {
    const fixture = createDocxFixture(
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
        `<w:p><w:r><w:t xml:space="preserve">Lead {{CITE:ABCD1234|lib=user:1234567|p=42}}</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>{{BIBLIOGRAPHY|lib=user:1234567|style=mla}}</w:t></w:r></w:p>` +
        `</w:body></w:document>`,
      baseCustomXml()
    );

    await processDocxStubs(fixture.inputPath, fixture.outputPath, async (key, librarySpec) => ({
      cslJson:
        '{"id":1,"type":"article-journal","title":"Making It Explicit","author":[{"family":"Brandom"}],"issued":{"date-parts":[[1994]]}}',
      numericId: 1,
      uri: `http://zotero.org/${librarySpec.startsWith("group:") ? "groups" : "users"}/${librarySpec.split(":")[1]}/items/${key}`,
      displayText: "(Brandom, 1994)",
    }));

    const entries = getDocxEntries(fixture.outputPath);
    const documentXml = entries.get("word/document.xml") ?? "";
    const customXml = entries.get("docProps/custom.xml") ?? "";

    expect(documentXml).toContain('w:fldCharType="begin"');
    expect(documentXml).toContain("ADDIN ZOTERO_ITEM CSL_CITATION");
    expect(documentXml).toContain('w:fldCharType="separate"');
    expect(documentXml).toContain("(Brandom, 1994)");
    expect(documentXml).toContain('w:fldCharType="end"');
    expect(customXml).toContain("ZOTERO_PREF_1");
    expect(customXml).toContain(
      "http://www.zotero.org/styles/modern-language-association"
    );
  });

  it("falls back to APA when the bibliography stub omits a style", async () => {
    const fixture = createDocxFixture(
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
        `<w:p><w:r><w:t>{{BIBLIOGRAPHY|lib=user:1234567}}</w:t></w:r></w:p>` +
        `</w:body></w:document>`,
      baseCustomXml()
    );

    await processDocxStubs(fixture.inputPath, fixture.outputPath, async () => ({
      cslJson: "{}",
      numericId: 1,
      uri: "http://zotero.org/users/1234567/items/ABCD1234",
      displayText: "(Brandom, 1994)",
    }));

    const customXml = getDocxEntries(fixture.outputPath).get("docProps/custom.xml") ?? "";
    expect(customXml).toContain("http://www.zotero.org/styles/apa");
  });

  it("passes each citation's library spec through to the fetcher and field XML", async () => {
    const fixture = createDocxFixture(
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
        `<w:p><w:r><w:t>{{CITE:ABCD1234|lib=user:1234567}}</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>{{CITE:EFGH5678|lib=group:98765}}</w:t></w:r></w:p>` +
        `</w:body></w:document>`,
      baseCustomXml()
    );
    const fetchItemJson = vi.fn(async (key: string, librarySpec: string) => ({
      cslJson:
        '{"id":1,"type":"article-journal","title":"Making It Explicit","author":[{"family":"Brandom"}],"issued":{"date-parts":[[1994]]}}',
      numericId: key === "ABCD1234" ? 1 : 2,
      uri: `http://zotero.org/${librarySpec.startsWith("group:") ? "groups" : "users"}/${librarySpec.split(":")[1]}/items/${key}`,
      displayText: key === "ABCD1234" ? "(Brandom, 1994)" : "(Brandom, 2008)",
    }));

    await processDocxStubs(fixture.inputPath, fixture.outputPath, fetchItemJson);

    const documentXml = getDocxEntries(fixture.outputPath).get("word/document.xml") ?? "";
    expect(fetchItemJson).toHaveBeenCalledWith("ABCD1234", "user:1234567");
    expect(fetchItemJson).toHaveBeenCalledWith("EFGH5678", "group:98765");
    expect(documentXml).toContain("http://zotero.org/users/1234567/items/ABCD1234");
    expect(documentXml).toContain("http://zotero.org/groups/98765/items/EFGH5678");
  });

  it("fails when the document mixes conflicting bibliography styles", async () => {
    const fixture = createDocxFixture(
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
        `<w:p><w:r><w:t>{{BIBLIOGRAPHY|lib=user:1234567|style=apa}}</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>{{BIBLIOGRAPHY|lib=user:1234567|style=mla}}</w:t></w:r></w:p>` +
        `</w:body></w:document>`,
      baseCustomXml()
    );

    await expect(
      processDocxStubs(fixture.inputPath, fixture.outputPath, async () => ({
        cslJson: "{}",
        numericId: 1,
        uri: "http://zotero.org/users/1234567/items/ABCD1234",
        displayText: "(Brandom, 1994)",
      }))
    ).rejects.toThrow("Conflicting bibliography styles");
  });
});

function createDocxFixture(documentXml: string, customXml: string) {
  const rootDir = mkdtempSync(join(tmpdir(), "zotero-docx-fixture-"));
  tmpPaths.push(rootDir);

  mkdirSync(join(rootDir, "_rels"), { recursive: true });
  mkdirSync(join(rootDir, "word"), { recursive: true });
  mkdirSync(join(rootDir, "docProps"), { recursive: true });

  writeFileSync(
    join(rootDir, "[Content_Types].xml"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `</Types>`
  );
  writeFileSync(
    join(rootDir, "_rels/.rels"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`
  );
  writeFileSync(join(rootDir, "word/document.xml"), documentXml);
  writeFileSync(join(rootDir, "docProps/custom.xml"), customXml);

  const inputPath = join(rootDir, "input.docx");
  const outputPath = join(rootDir, "output.docx");
  execFileSync(
    "zip",
    ["-r", "-X", inputPath, "[Content_Types].xml", "_rels", "word", "docProps"],
    {
      cwd: rootDir,
      stdio: "ignore",
    }
  );

  return { inputPath, outputPath };
}

function baseCustomXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" ` +
    `xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    `</Properties>`
  );
}

function getDocxEntries(path: string): Map<string, string> {
  return new Map(
    readZip(readFileSync(path)).map((entry) => [entry.name, entry.data.toString("utf-8")])
  );
}
