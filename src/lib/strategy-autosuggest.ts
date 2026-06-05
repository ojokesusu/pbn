// Rule-based strategy auto-suggest. Mirrors the niche-autosuggest pattern:
// no AI, no network — pure regex over the domain URL/name so we can bulk-tag
// thousands of rows in one request without burning tokens.
//
// Strategy buckets:
//   - blackhat: explicit iGaming / judi / gacor / casino spam patterns. These
//     domains must be siloed away from clean money sites and never share IP
//     class-C with whitehat assets.
//   - greyhat:  money niches that aren't strictly iGaming but still ToS-risky
//     (crypto, forex, supplements, fast loans). Buffered tier-2.
//   - whitehat: everything else — default safe bucket for general content.
//
// First match wins. Order matters; we check blackhat -> greyhat -> whitehat.

export type Strategy = "whitehat" | "greyhat" | "blackhat";

export interface StrategyHint {
  strategy: Strategy;
  confidence: "high" | "medium" | "low";
  reason: string;
}

export interface StrategyInput {
  url: string;
  name?: string;
}

// Explicit iGaming / online-gambling vocab. These tokens are unambiguous —
// any domain carrying one of them is treated as money-keyword stuffing and
// gets routed to the blackhat silo.
const BLACKHAT_KEYWORDS =
  /(casino|slot|judi|togel|bandar|gacor|baccarat|poker|sportsbook|gambling|jackpot|rolet|live[_-]?casino|igaming)/i;

// Brand-stuffing fingerprint: "4dx", "8dt", "toto1234", "totomania",
// "togel77" style domains that the iGaming SEO crowd churns out.
// /\dxd[a-z]/ catches the "4dxslot", "9dxhoki" pattern Sandi sees in the
// inventory; "totox" / "totomania" cover the toto-brand swarm. The 5+ digits
// check fires on numeric stuffing like "slot777888".
const BLACKHAT_FINGERPRINT = /(\dxd[a-z]|totox|totomania)/i;
const DIGIT_STUFFING = /\d{5,}/;

// Grey-area money niches: not iGaming but still high-risk for Google. We
// buffer these to tier-2 PBN tiers (separate IP class than blackhat AND
// separate from whitehat money sites).
const GREYHAT_KEYWORDS =
  /(crypto|kripto|forex|trading|invest|signal|kredit|loan|fintech|fitness|supplement)/i;

// Strip protocol / www / trailing path so the matcher only sees the brand
// slug. Hyphens collapse to spaces so word-ish matching behaves predictably.
function normalize(input: StrategyInput): string {
  const raw = `${input.url || ""} ${input.name || ""}`.toLowerCase();
  return raw
    .replace(/^https?:\/\//g, "")
    .replace(/^www\./g, "")
    .replace(/[-_/.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Domain-only slice (no name, no path) for fingerprint checks that should
// only fire on the host itself — e.g. "totox" inside a path segment of a
// whitehat news site shouldn't flag the whole domain as blackhat.
function domainSlug(input: StrategyInput): string {
  const url = (input.url || "").toLowerCase();
  return url
    .replace(/^https?:\/\//g, "")
    .replace(/^www\./g, "")
    .split("/")[0]
    .trim();
}

export function detectStrategy(input: StrategyInput): StrategyHint {
  if (!input || !input.url) {
    return {
      strategy: "whitehat",
      confidence: "low",
      reason: "no url provided, defaulting to whitehat",
    };
  }

  const haystack = normalize(input);
  const slug = domainSlug(input);

  // ---- BLACKHAT: explicit iGaming vocab ----
  const blackMatch = haystack.match(BLACKHAT_KEYWORDS);
  if (blackMatch) {
    return {
      strategy: "blackhat",
      confidence: "high",
      reason: `iGaming keyword detected: "${blackMatch[1]}"`,
    };
  }

  // ---- BLACKHAT: brand-stuffing fingerprint on domain slug ----
  const fingerprintMatch = slug.match(BLACKHAT_FINGERPRINT);
  if (fingerprintMatch) {
    return {
      strategy: "blackhat",
      confidence: "high",
      reason: `iGaming brand pattern detected: "${fingerprintMatch[1]}"`,
    };
  }

  // ---- BLACKHAT: numeric stuffing (5+ digits in the bare domain slug) ----
  // Common shape: "slot777888.com", "togel123456.id". We only fire on the
  // host so a legitimate URL with a long ID in the path doesn't trip it.
  if (DIGIT_STUFFING.test(slug.replace(/\.[a-z.]+$/, ""))) {
    return {
      strategy: "blackhat",
      confidence: "high",
      reason: "numeric keyword stuffing in domain (5+ digits)",
    };
  }

  // ---- GREYHAT: money niches that aren't iGaming ----
  const greyMatch = haystack.match(GREYHAT_KEYWORDS);
  if (greyMatch) {
    return {
      strategy: "greyhat",
      confidence: "medium",
      reason: `money-niche keyword detected: "${greyMatch[1]}"`,
    };
  }

  // ---- WHITEHAT: default ----
  return {
    strategy: "whitehat",
    confidence: "low",
    reason: "no risk pattern matched, defaulting to whitehat",
  };
}
