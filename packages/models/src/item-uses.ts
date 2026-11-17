/**
 * Uses/recovery structure for consumable items with charges
 */
export interface UsesData {
  max: string;
  recovery: Array<{
    period: "dawn" | "day" | "rest" | "hour" | "charges" | string;
    type: "formula" | "formulaic" | string;
    formula?: string;
    amount?: number;
  }>;
  spent: number;
}
