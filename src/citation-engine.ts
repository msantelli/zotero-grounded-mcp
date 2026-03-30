/**
 * Citation engine wrapping citeproc-js for proper CSL formatting.
 *
 * Uses createRequire to load the CJS-only citeproc package from ESM.
 * Bundles Chicago Author-Date style and en-US locale as string constants.
 */

import { createRequire } from "node:module";
import { chicagoAuthorDateStyle } from "./csl/chicago-author-date.js";
import { apaStyle } from "./csl/apa.js";
import { mlaStyle } from "./csl/mla.js";
import { ieeeStyle } from "./csl/ieee.js";
import { harvardStyle } from "./csl/harvard.js";
import { localeEnUS } from "./csl/locales-en-US.js";
import { htmlToMarkdown } from "./html-utils.js";

const require = createRequire(import.meta.url);
const CSL = require("citeproc");

const styles: Record<string, string> = {
  "chicago-author-date": chicagoAuthorDateStyle,
  "apa": apaStyle,
  "mla": mlaStyle,
  "ieee": ieeeStyle,
  "harvard": harvardStyle,
};

const locales: Record<string, string> = {
  "en-US": localeEnUS,
};

interface CslItem {
  id: string;
  [key: string]: unknown;
}

/**
 * A CitationEngine wraps a citeproc CSL.Engine for a given style,
 * accepting CSL-JSON items and producing formatted citations and bibliographies.
 */
export class CitationEngine {
  private engine: InstanceType<typeof CSL.Engine>;
  private items: Map<string, CslItem> = new Map();

  constructor(styleName: string = "chicago-author-date") {
    const styleXml = styles[styleName];
    if (!styleXml) {
      throw new Error(
        `Unknown CSL style: "${styleName}". Available: ${Object.keys(styles).join(", ")}`
      );
    }

    const sys = {
      retrieveLocale: (lang: string): string => {
        return locales[lang] ?? locales["en-US"];
      },
      retrieveItem: (id: string): CslItem => {
        const item = this.items.get(id);
        if (!item) throw new Error(`Item not found: ${id}`);
        return item;
      },
    };

    this.engine = new CSL.Engine(sys, styleXml);
  }

  /**
   * Register CSL-JSON items with the engine. Each item must have an `id` field.
   */
  registerItems(cslItems: CslItem[]): void {
    for (const item of cslItems) {
      this.items.set(String(item.id), item);
    }
    this.engine.updateItems(Array.from(this.items.keys()));
  }

  /**
   * Generate an inline citation cluster for the given item IDs.
   * Returns e.g. "(Brandom 2004)" or "(Smith 2020; Jones 2021)".
   */
  makeCitation(ids: string[]): string {
    const citationItems = ids.map((id) => ({ id: String(id) }));
    const html: string = this.engine.makeCitationCluster(citationItems);
    return htmlToMarkdown(html);
  }

  /**
   * Generate a full formatted bibliography for all registered items.
   * Returns an array of formatted entry strings (one per item).
   */
  makeBibliography(): string[] {
    const [_params, entries] = this.engine.makeBibliography();
    return entries.map((entry: string) => htmlToMarkdown(entry));
  }
}

// Cache engine instances by style name
const engineCache = new Map<string, CitationEngine>();

/**
 * Get or create a CitationEngine for the given style.
 * Returns a fresh engine (items must be re-registered per use).
 */
export function getEngine(styleName: string = "chicago-author-date"): CitationEngine {
  // Always return a new engine since items are registered per-call.
  // The style validation still benefits from caching the style lookup.
  return new CitationEngine(styleName);
}
