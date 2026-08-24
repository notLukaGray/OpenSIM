export type Diagnostic = { level: "error" | "warning"; file: string; path: string; message: string };

export type ContentBundleForValidation = {
  brands: unknown[];
  archetypes: unknown[];
  modifiers: unknown[];
  evidence: unknown[];
  assets: unknown[];
  audioTracks: unknown[];
  trees: unknown[];
};

export function validateContent(bundle: ContentBundleForValidation): {
  ok: boolean;
  errors: Diagnostic[];
  warnings: Diagnostic[];
  all: Diagnostic[];
};
