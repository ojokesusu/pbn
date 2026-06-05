// Public surface for the SERP module. Import from "@/lib/serp" rather than
// the individual adapters so we can swap providers without touching call
// sites.

import { serperProvider } from "./serper";
import type { SerpProvider } from "./types";

export type { SerpResult, SerpResponse, SerpProvider } from "./types";
export { serperProvider } from "./serper";

// Returns the active default provider. Currently Serper (cheapest reliable
// Google SERP API). When we add DataForSEO / SerpApi adapters, swap the
// pick logic here based on env or load balancing.
export function pickProvider(): SerpProvider {
  return serperProvider;
}
