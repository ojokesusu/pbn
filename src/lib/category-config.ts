// Shared category contract — kept in its own module with zero imports so
// scheduler.ts and generator.ts can both read it without re-introducing the
// circular import (generator → scheduler → deploy → generator).
//
// Every scheduler-created article picks a category from this list. Legacy
// WP imports (BENCANA / ARSIP IJAZAH / UNCATEGORIZED / etc.) stay in the DB
// for historic article resolution but never get new assignments, and the
// generator filters them out of the rendered nav.
//
// Slugs are stable — never rename. To add a new category, push to NAMES.

export const SCHEDULER_CATEGORY_NAMES = ["Berita", "Tips", "Review", "Tutorial", "Opini"] as const;

export const SCHEDULER_CATEGORY_SLUGS = SCHEDULER_CATEGORY_NAMES.map(
  (n) => n.toLowerCase().replace(/\s+/g, "-"),
);
