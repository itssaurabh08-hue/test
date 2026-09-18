// Pure preview-rendering logic — substitutes resolved variable values into
// a template's header/body text so the UI can show what a recipient will
// actually see, e.g. "Hello Rahul, you are invited to Sports Day on
// 25 September." No env/DB access, unit testable directly.

import type { MetaTemplate } from "@/lib/meta/metaTemplates";
import type { ResolvedVariables } from "@/lib/templates/variableMapping";

const VARIABLE_PATTERN = /\{\{\s*(\d+)\s*\}\}/g;

function substitute(text: string, values: Record<string, string> | undefined): string {
  return text.replace(VARIABLE_PATTERN, (_match, index: string) => {
    const value = values?.[index];
    return value && value.trim() ? value : `[missing {{${index}}}]`;
  });
}

export interface RenderedPreview {
  headerLine: string | null;
  bodyText: string;
  footerText: string | null;
  missing: string[];
}

export function renderTemplatePreview(
  template: MetaTemplate,
  resolved: ResolvedVariables
): RenderedPreview {
  const header = template.components.find((c) => c.type === "HEADER");
  const body = template.components.find((c) => c.type === "BODY");
  const footer = template.components.find((c) => c.type === "FOOTER");

  let headerLine: string | null = null;
  if (header?.format === "TEXT" && header.text) {
    headerLine = resolved.input.headerText
      ? substitute(header.text, { "1": resolved.input.headerText })
      : header.text;
  } else if (header?.format && header.format !== "TEXT") {
    headerLine = `[${header.format} header${resolved.input.headerMediaLink ? "" : " — missing media"}]`;
  }

  const bodyText = body?.text ? substitute(body.text, resolved.input.body) : "";

  return {
    headerLine,
    bodyText,
    footerText: footer?.text ?? null,
    missing: resolved.missing,
  };
}
