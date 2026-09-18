// Pure logic for resolving a template's {{n}} variables to per-contact
// values. No env/DB access, so it's unit testable directly. Used by the
// campaign creation wizard (variable mapping + preview steps) and by the
// queue worker when it actually builds each recipient's send payload.

import type { TemplateVariableInput } from "@/lib/meta/templatePayload";

export type VariableSource = "column" | "static" | "contactField";

export interface VariableBinding {
  source: VariableSource;
  /**
   * For "column": the spreadsheet header (looked up in contact.metadata).
   * For "contactField": one of "name" | "phone" | "email".
   * For "static": the literal value itself.
   */
  value: string;
}

export interface VariableMappingConfig {
  /** 1-indexed body variable number -> binding. */
  body: Record<string, VariableBinding>;
  headerText?: VariableBinding;
  headerMediaLink?: VariableBinding;
  /** Button index (0-based) -> binding. */
  buttons?: Record<number, VariableBinding>;
}

export interface ContactLike {
  name: string;
  phone: string;
  email?: string | null;
  metadata: Record<string, unknown>;
}

const CONTACT_FIELDS = new Set(["name", "phone", "email"]);

export function isKnownContactField(field: string): boolean {
  return CONTACT_FIELDS.has(field);
}

function resolveBinding(binding: VariableBinding, contact: ContactLike): string {
  switch (binding.source) {
    case "static":
      return binding.value;
    case "contactField": {
      if (binding.value === "name") return contact.name;
      if (binding.value === "phone") return contact.phone;
      if (binding.value === "email") return contact.email ?? "";
      return "";
    }
    case "column": {
      const raw = contact.metadata[binding.value];
      return raw === null || raw === undefined ? "" : String(raw);
    }
    default:
      return "";
  }
}

export interface ResolvedVariables {
  input: TemplateVariableInput;
  /** Human-readable labels (e.g. "Body {{2}}") of variables that resolved to an empty string. */
  missing: string[];
}

/** Resolves every configured variable binding for one contact. Never throws — empty values are reported in `missing` instead. */
export function resolveVariablesForContact(
  mapping: VariableMappingConfig,
  contact: ContactLike
): ResolvedVariables {
  const missing: string[] = [];
  const body: Record<string, string> = {};

  for (const [index, binding] of Object.entries(mapping.body)) {
    const value = resolveBinding(binding, contact);
    body[index] = value;
    if (!value.trim()) missing.push(`Body {{${index}}}`);
  }

  let headerText: string | undefined;
  if (mapping.headerText) {
    headerText = resolveBinding(mapping.headerText, contact);
    if (!headerText.trim()) missing.push("Header text");
  }

  let headerMediaLink: string | undefined;
  if (mapping.headerMediaLink) {
    headerMediaLink = resolveBinding(mapping.headerMediaLink, contact);
    if (!headerMediaLink.trim()) missing.push("Header media");
  }

  const buttons: Record<number, string> = {};
  for (const [index, binding] of Object.entries(mapping.buttons ?? {})) {
    const value = resolveBinding(binding, contact);
    buttons[Number(index)] = value;
    if (!value.trim()) missing.push(`Button ${Number(index) + 1}`);
  }

  return {
    input: {
      body,
      headerText,
      headerMediaLink,
      buttons: Object.keys(buttons).length > 0 ? buttons : undefined,
    },
    missing,
  };
}
