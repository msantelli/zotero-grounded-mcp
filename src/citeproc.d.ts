/**
 * Minimal type declarations for the citeproc-js library.
 * The package ships only a CJS bundle with no types.
 */

declare namespace CSL {
  interface Sys {
    retrieveLocale(lang: string): string;
    retrieveItem(id: string): Record<string, unknown>;
  }

  class Engine {
    constructor(sys: Sys, style: string);
    updateItems(ids: string[]): void;
    makeCitationCluster(
      citations: Array<{ id: string }>
    ): string;
    makeBibliography(): [
      { bibstart: string; bibend: string },
      string[]
    ];
  }
}

export = CSL;
