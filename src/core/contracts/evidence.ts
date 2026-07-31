/**
 * Stable source span used by intake, generation, verification, and portable
 * runtime contracts. This type deliberately has no dependency on any workflow.
 */
export interface EvidenceRef {
  start: number;
  end: number;
  quote: string;
}

