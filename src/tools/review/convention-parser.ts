/**
 * Convention parser re-export.
 *
 * All convention parsing now uses the single canonical parser
 * at src/conventions/parser.ts. This file preserves the import
 * path for existing consumers (e.g., src/tools/review/handler.ts).
 */
export {
  parseDetectorConventions as parseConventions,
  type ParsedConvention,
} from "../../conventions/parser.js";
