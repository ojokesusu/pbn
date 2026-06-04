// ── Public surface for the image picker ──
// Consumers should only import from this barrel.

export type { ImageContext, ImageResult, ImageAdapter } from "./types";
export { pickImages } from "./picker";
export { getImageAdapter } from "./registry";
