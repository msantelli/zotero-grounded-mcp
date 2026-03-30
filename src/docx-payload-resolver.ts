import { keyToNumericId } from "./docx-processor.js";
import type { ZoteroItem } from "./zotero-client.js";

export interface DocxItemPayload {
  cslJson: string;
  numericId: number;
  uri: string;
  displayText: string;
}

export function createDocxItemPayloadResolver(options: {
  defaultLibrarySpec: string;
  getItem: (key: string) => Promise<ZoteroItem>;
}): (key: string, librarySpec: string) => Promise<DocxItemPayload> {
  const cache = new Map<string, Promise<DocxItemPayload>>();

  return async (key: string, librarySpec: string): Promise<DocxItemPayload> => {
    const spec = librarySpec || options.defaultLibrarySpec;
    const cacheKey = `${spec}::${key}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const payloadPromise = options
      .getItem(key)
      .then((item) => buildDocxItemPayload(item, spec))
      .catch((error) => {
        cache.delete(cacheKey);
        throw error;
      });

    cache.set(cacheKey, payloadPromise);
    return payloadPromise;
  };
}

function buildDocxItemPayload(
  item: ZoteroItem,
  librarySpec: string
): DocxItemPayload {
  const key = item.key;
  const cslJson = item.csljson ?? {};
  const numericId = keyToNumericId(key);
  const cslWithFixedId = { ...cslJson, id: numericId };

  const uriPrefix = librarySpec.startsWith("group:")
    ? `groups/${librarySpec.slice(6)}`
    : `users/${librarySpec.slice(5)}`;

  const authors = (cslJson as Record<string, unknown>).author as
    | Array<{ family?: string }>
    | undefined;
  const issued = (cslJson as Record<string, unknown>).issued as
    | { "date-parts"?: unknown[][] }
    | undefined;
  const year = issued?.["date-parts"]?.[0]?.[0] ?? "n.d.";
  const authorName = authors?.[0]?.family ?? "Unknown";

  return {
    cslJson: JSON.stringify(cslWithFixedId),
    numericId,
    uri: `http://zotero.org/${uriPrefix}/items/${key}`,
    displayText: `(${authorName}, ${year})`,
  };
}
