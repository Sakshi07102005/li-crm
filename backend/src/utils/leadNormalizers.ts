/**
 * Pure helper functions for lead input normalisation and validation.
 */

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function isValidEmail(email: string): boolean {
  if (email.length > 254) return false;
  // RFC 5322 compatible regex matching 001_init_schema.sql CHECK constraint
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

/**
 * Normalises mobile number:
 * - trim
 * - remove spaces, dashes, dots, parentheses
 * - keep one optional leading "+"
 * - remaining must be 7-15 digits
 * Returns normalised string or null if invalid.
 */
export function normalizeMobile(mobile: string | null | undefined): string | null {
  if (!mobile) return null;
  const trimmed = mobile.trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith('+');
  // Remove all spaces, dashes, dots, parentheses and plus
  const digitsOnly = trimmed.replace(/[\s\-\.\(\)\+]/g, '');

  if (!/^[0-9]{7,15}$/.test(digitsOnly)) {
    return null;
  }

  return (hasPlus ? '+' : '') + digitsOnly;
}

/**
 * Extracts last 10 digits for duplicate comparison matching migration 003:
 * RIGHT(REGEXP_REPLACE(mobile, '[^0-9]', '', 'g'), 10)
 */
export function getMobileLast10(mobile: string): string {
  const digits = mobile.replace(/[^0-9]/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Normalises website:
 * - trim
 * - if no scheme, prepend "https://"
 * - must parse as valid http(s) URL
 * - max 255 chars
 */
export function normalizeWebsite(website: string | null | undefined): string | null {
  if (!website) return null;
  let trimmed = website.trim();
  if (!trimmed) return null;

  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = 'https://' + trimmed;
  }

  if (trimmed.length > 255) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * Escapes PostgreSQL LIKE/ILIKE wildcards (%, _, \) so substring match is literal.
 */
export function escapeLikeWildcards(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

