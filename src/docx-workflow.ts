import { createDocxItemPayloadResolver } from "./docx-payload-resolver.js";
import { serializeLibraryContext } from "./citation-stubs.js";
import type { ZoteroClient } from "./zotero-client.js";

export async function createDocxProcessingContext(
  client: Pick<ZoteroClient, "getLibraryContext" | "getItemForLibrarySpec">
) {
  const libraryContext = await client.getLibraryContext();
  const defaultLibrarySpec = serializeLibraryContext(libraryContext);
  const resolveDocxItemPayload = createDocxItemPayloadResolver({
    defaultLibrarySpec,
    getItem: (key, librarySpec) =>
      client.getItemForLibrarySpec(key, librarySpec || defaultLibrarySpec),
  });

  return {
    defaultLibrarySpec,
    resolveDocxItemPayload,
  };
}
