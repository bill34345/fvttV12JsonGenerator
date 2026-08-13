export const MODULE_ID = "fvtt-battlefield-painter";
export const MODULE_TITLE = "Battlefield Painter";

export const DOCUMENT_ORDER = [
  "Tile",
  "Region",
  "AmbientLight",
  "Wall",
] as const;

export type PlannedDocumentName = (typeof DOCUMENT_ORDER)[number];

