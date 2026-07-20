/** Client-side validation and artifact helpers. Values never leave the device. */

const FREEMAIL = [
  "gmail.com",
  "googlemail.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
];

const FREEMAIL_PREFIX = ["yahoo.", "outlook.", "hotmail."];

/** Returns true when a 16-digit number passes the Luhn check. */
export function luhnValid(digits) {
  const cleaned = String(digits).replace(/\D/g, "");
  let sum = 0;
  let alt = false;
  for (let i = cleaned.length - 1; i >= 0; i -= 1) {
    let n = Number(cleaned[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return cleaned.length === 16 && sum % 10 === 0;
}

export function isFreemail(email) {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  if (FREEMAIL.includes(domain)) return true;
  return FREEMAIL_PREFIX.some((prefix) => domain.startsWith(prefix));
}

export function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Validates a field step. Returns { ok: true } or { ok: false, code }.
 * attempt is 1-based for this step.
 */
export function validateField(stepId, value, attempt) {
  const raw = typeof value === "string" ? value : "";
  const trimmed = raw.trim();

  if (stepId === "name" || stepId === "company") {
    return trimmed.length > 0 ? { ok: true } : { ok: false, code: "required" };
  }

  if (stepId === "company_email") {
    if (!looksLikeEmail(trimmed)) return { ok: false, code: "format" };
    if (isFreemail(trimmed) && attempt <= 2) {
      return { ok: false, code: "freemail" };
    }
    return { ok: true };
  }

  if (stepId === "phone") {
    if (attempt === 1) return { ok: false, code: "format" };
    const digits = trimmed.replace(/\D/g, "");
    return digits.length >= 10 ? { ok: true } : { ok: false, code: "format" };
  }

  if (stepId === "app_name") {
    if (attempt === 1) return { ok: false, code: "already_taken" };
    if (attempt >= 4) {
      return trimmed.length > 0 ? { ok: true } : { ok: false, code: "required" };
    }
    if (trimmed.length >= 3 && trimmed.length <= 30 && !/\s/.test(trimmed)) {
      return { ok: true };
    }
    return { ok: false, code: "already_taken" };
  }

  if (stepId === "add_card") {
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length !== 16) return { ok: false, code: "format" };
    if (attempt > 3) return { ok: true };
    if (luhnValid(digits)) return { ok: false, code: "card_declined" };
    return { ok: true };
  }

  return trimmed.length > 0 ? { ok: true } : { ok: false, code: "required" };
}

export function randomHex(length) {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

/** Creates a named artifact string held only in localStorage. */
export function createArtifact(name) {
  if (name === "app_keys") {
    const client = `fsk_client_${randomHex(12)}`;
    const secret = `fsk_secret_${randomHex(24)}`;
    return `${client}\n${secret}`;
  }
  if (name === "oauth_token") {
    return `fso_${randomHex(32)}`;
  }
  throw new Error(`unknown artifact ${name}`);
}

export function artifactKey(name) {
  return `fakesaaspi:artifact:${name}`;
}

export function saveArtifact(name, value) {
  localStorage.setItem(artifactKey(name), value);
}

export function loadArtifact(name) {
  return localStorage.getItem(artifactKey(name));
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Resolves the crowd rank line "#N of M." once ingest meta reports a shipped
 * count past the baseline, or "" if it does not arrive within timeoutMs.
 * getMeta returns the latest ingest meta (or null) on each poll.
 */
export async function awaitRankLine(getMeta, baselineShipped, timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const meta = getMeta();
    if (
      meta &&
      typeof meta.shipped === "number" &&
      typeof meta.started === "number" &&
      (baselineShipped === null || meta.shipped !== baselineShipped)
    ) {
      return `#${meta.shipped} of ${meta.started}.`;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return "";
}
