/**
 * Phone number normalisation for WhatsApp Cloud API sends.
 *
 * WhatsApp requires numbers in E.164 format without a leading "+" in the
 * `to` field of a `messages` API call, but we store/display them WITH a
 * leading "+" (standard E.164) and strip it only at send time
 * (see lib/meta/metaMessages.ts).
 *
 * We deliberately do NOT blindly prepend a country code to every number:
 * a bare 10-digit string is only treated as a local number for the
 * configured default country, and only if it matches that country's
 * mobile numbering pattern. Anything else is reported invalid rather than
 * guessed at.
 */

export interface CountryPhoneConfig {
  /** ISO 3166-1 alpha-2 code, e.g. "IN". */
  isoCode: string;
  /** E.164 calling code without "+", e.g. "91". */
  callingCode: string;
  /** Length of the national significant number (subscriber number). */
  nsnLength: number;
  /** Regex the national significant number must match (mobile numbers only). */
  mobilePattern: RegExp;
  label: string;
}

// Add more entries here to support additional default countries — nothing
// else in the app needs to change, since DEFAULT_COUNTRY_CODE just selects
// one of these.
export const COUNTRY_CONFIGS: Record<string, CountryPhoneConfig> = {
  IN: {
    isoCode: "IN",
    callingCode: "91",
    nsnLength: 10,
    mobilePattern: /^[6-9]\d{9}$/,
    label: "India",
  },
  US: {
    isoCode: "US",
    callingCode: "1",
    nsnLength: 10,
    mobilePattern: /^[2-9]\d{9}$/,
    label: "United States",
  },
  GB: {
    isoCode: "GB",
    callingCode: "44",
    nsnLength: 10,
    mobilePattern: /^7\d{9}$/,
    label: "United Kingdom",
  },
};

export const DEFAULT_COUNTRY = "IN";

export interface PhoneNormalisationResult {
  valid: boolean;
  /** E.164 with leading "+", e.g. "+919876543210". Present only if valid. */
  e164?: string;
  /** ISO country code the number was resolved against. */
  countryCode?: string;
  reason?: string;
}

/** Strips everything except leading "+" and digits. */
function cleanRaw(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digitsOnly = trimmed.replace(/[^\d]/g, "");
  return hasPlus ? `+${digitsOnly}` : digitsOnly;
}

function isValidForCountry(nsn: string, country: CountryPhoneConfig): boolean {
  return nsn.length === country.nsnLength && country.mobilePattern.test(nsn);
}

export function normalizePhoneNumber(
  raw: string | null | undefined,
  defaultCountryIso: string = DEFAULT_COUNTRY
): PhoneNormalisationResult {
  if (!raw || !raw.trim()) {
    return { valid: false, reason: "blank" };
  }

  const country = COUNTRY_CONFIGS[defaultCountryIso.toUpperCase()];
  if (!country) {
    return { valid: false, reason: `unsupported default country: ${defaultCountryIso}` };
  }

  let cleaned = cleanRaw(raw);

  // Normalise "00" international prefix to "+".
  if (!cleaned.startsWith("+") && cleaned.startsWith("00")) {
    cleaned = `+${cleaned.slice(2)}`;
  }

  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1);
    if (digits.length < 8 || digits.length > 15) {
      return { valid: false, reason: "invalid E.164 length" };
    }
    // If it matches the default country's calling code, validate the NSN
    // against that country's mobile pattern for a stronger guarantee.
    if (digits.startsWith(country.callingCode)) {
      const nsn = digits.slice(country.callingCode.length);
      if (isValidForCountry(nsn, country)) {
        return { valid: true, e164: `+${digits}`, countryCode: country.isoCode };
      }
      return { valid: false, reason: `not a valid ${country.label} mobile number` };
    }
    // A different country's E.164 number — accept as-is (well-formed,
    // just not the default country); we can't validate an arbitrary
    // country's mobile pattern without a full numbering-plan database.
    return { valid: true, e164: `+${digits}` };
  }

  // No "+": try the calling code without "+" (e.g. "919876543210"), then
  // fall back to a bare national number (e.g. "9876543210").
  if (cleaned.startsWith(country.callingCode)) {
    const nsn = cleaned.slice(country.callingCode.length);
    if (isValidForCountry(nsn, country)) {
      return {
        valid: true,
        e164: `+${country.callingCode}${nsn}`,
        countryCode: country.isoCode,
      };
    }
  }

  // Leading trunk "0" sometimes typed in spreadsheets by mistake.
  const withoutTrunkZero = cleaned.startsWith("0") ? cleaned.slice(1) : cleaned;
  if (isValidForCountry(withoutTrunkZero, country)) {
    return {
      valid: true,
      e164: `+${country.callingCode}${withoutTrunkZero}`,
      countryCode: country.isoCode,
    };
  }

  if (isValidForCountry(cleaned, country)) {
    return {
      valid: true,
      e164: `+${country.callingCode}${cleaned}`,
      countryCode: country.isoCode,
    };
  }

  return { valid: false, reason: `not a valid ${country.label} mobile number` };
}

/** For use with the Meta `to` field, which expects no leading "+". */
export function e164ToWhatsAppFormat(e164: string): string {
  return e164.startsWith("+") ? e164.slice(1) : e164;
}
