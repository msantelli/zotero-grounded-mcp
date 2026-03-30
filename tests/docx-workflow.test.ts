import { describe, expect, it, vi } from "vitest";
import { createDocxProcessingContext } from "../src/docx-workflow.js";
import { journalArticle } from "./fixtures/zotero-responses.js";

describe("docx workflow", () => {
  it("uses the client's default library context when no stub library is provided", async () => {
    const client = {
      getLibraryContext: vi.fn().mockResolvedValue({ type: "user" as const, userId: "1234567" }),
      getItemForLibrarySpec: vi.fn().mockResolvedValue(journalArticle),
    };

    const { defaultLibrarySpec, resolveDocxItemPayload } =
      await createDocxProcessingContext(client);
    await resolveDocxItemPayload("ABCD1234", "");

    expect(defaultLibrarySpec).toBe("user:1234567");
    expect(client.getItemForLibrarySpec).toHaveBeenCalledWith(
      "ABCD1234",
      "user:1234567"
    );
  });

  it("uses each stub's library spec for mixed-library documents", async () => {
    const client = {
      getLibraryContext: vi.fn().mockResolvedValue({ type: "user" as const, userId: "1234567" }),
      getItemForLibrarySpec: vi.fn().mockResolvedValue(journalArticle),
    };

    const { resolveDocxItemPayload } = await createDocxProcessingContext(client);
    await resolveDocxItemPayload("ABCD1234", "group:98765");

    expect(client.getItemForLibrarySpec).toHaveBeenCalledWith(
      "ABCD1234",
      "group:98765"
    );
  });
});
