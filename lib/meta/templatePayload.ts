// Pure template-payload logic — no env access, no network calls, no
// "server-only" guard, so it can be unit tested directly. Only
// lib/meta/metaMessages.ts (which actually calls the Meta API) is
// server-only.

import type { MetaTemplate, MetaTemplateComponent } from "@/lib/meta/metaTemplates";

export interface TemplateVariableInput {
  /** 1-indexed body variable number -> resolved value. */
  body?: Record<string, string>;
  /** Value for a single {{1}} in a TEXT header, if the template has one. */
  headerText?: string;
  /** Public URL for an IMAGE/VIDEO/DOCUMENT header, if the template needs one. */
  headerMediaLink?: string;
  /** Button index (0-based) -> dynamic parameter (URL suffix or quick-reply payload). */
  buttons?: Record<number, string>;
}

export interface OutboundTemplateComponent {
  type: "header" | "body" | "button";
  sub_type?: "quick_reply" | "url";
  index?: string;
  parameters: Array<Record<string, unknown>>;
}

interface MetaTemplateButtonWithIndex {
  type: string;
  text?: string;
  url?: string;
  phone_number?: string;
  example?: string[];
  index: number;
}

const VARIABLE_PATTERN = /\{\{\s*(\d+)\s*\}\}/g;

export function extractBodyVariableIndexes(template: MetaTemplate): number[] {
  const body = template.components.find((c) => c.type === "BODY");
  if (!body?.text) return [];
  const indexes = new Set<number>();
  for (const match of body.text.matchAll(VARIABLE_PATTERN)) {
    indexes.add(Number(match[1]));
  }
  return [...indexes].sort((a, b) => a - b);
}

export function getHeaderComponent(template: MetaTemplate): MetaTemplateComponent | undefined {
  return template.components.find((c) => c.type === "HEADER");
}

export function headerHasVariable(template: MetaTemplate): boolean {
  const header = getHeaderComponent(template);
  if (!header || header.format !== "TEXT" || !header.text) return false;
  return new RegExp(VARIABLE_PATTERN).test(header.text);
}

export function getButtonComponents(template: MetaTemplate): MetaTemplateButtonWithIndex[] {
  const buttons = template.components.find((c) => c.type === "BUTTONS");
  if (!buttons?.buttons) return [];
  return buttons.buttons.map((b, index) => ({ ...b, index }));
}

/** True if a button needs a dynamic parameter (a URL button with a `{{1}}` in its URL). */
function buttonNeedsParameter(button: MetaTemplateButtonWithIndex): boolean {
  return button.type === "URL" && Boolean(button.url && new RegExp(VARIABLE_PATTERN).test(button.url));
}

export class TemplatePayloadError extends Error {}

/**
 * Builds the `template.components` array for an outbound message, given
 * the approved template's structure and resolved variable values. Throws
 * TemplatePayloadError if a required variable is missing — callers
 * (the campaign preview/send path) should catch this per-recipient and
 * surface it rather than sending a malformed request to Meta.
 */
export function buildTemplateComponents(
  template: MetaTemplate,
  variables: TemplateVariableInput
): OutboundTemplateComponent[] {
  const components: OutboundTemplateComponent[] = [];

  const header = getHeaderComponent(template);
  if (header) {
    if (header.format === "TEXT" && headerHasVariable(template)) {
      if (!variables.headerText) {
        throw new TemplatePayloadError("Missing header text variable.");
      }
      components.push({
        type: "header",
        parameters: [{ type: "text", text: variables.headerText }],
      });
    } else if (header.format && ["IMAGE", "VIDEO", "DOCUMENT"].includes(header.format)) {
      if (!variables.headerMediaLink) {
        throw new TemplatePayloadError(`Missing header ${header.format.toLowerCase()} media link.`);
      }
      const key = header.format.toLowerCase();
      components.push({
        type: "header",
        parameters: [{ type: key, [key]: { link: variables.headerMediaLink } }],
      });
    }
  }

  const bodyIndexes = extractBodyVariableIndexes(template);
  if (bodyIndexes.length > 0) {
    const parameters = bodyIndexes.map((idx) => {
      const value = variables.body?.[String(idx)];
      if (!value) {
        throw new TemplatePayloadError(`Missing body variable {{${idx}}}.`);
      }
      return { type: "text", text: value };
    });
    components.push({ type: "body", parameters });
  }

  for (const button of getButtonComponents(template)) {
    if (!buttonNeedsParameter(button)) continue;
    const value = variables.buttons?.[button.index];
    if (!value) {
      throw new TemplatePayloadError(`Missing parameter for button ${button.index + 1}.`);
    }
    components.push({
      type: "button",
      sub_type: "url",
      index: String(button.index),
      parameters: [{ type: "text", text: value }],
    });
  }

  return components;
}
