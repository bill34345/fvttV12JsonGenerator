export type SpeciesAutomation = 'native' | 'descriptive' | 'gm-assisted' | 'external-rule';

export type SpeciesMechanic =
  | { kind: 'descriptive-passive' }
  | { kind: 'gm-assisted'; boundaries: string[] }
  | { kind: 'external-rule'; boundaries: string[] }
  | { kind: 'hp-per-level'; value: number }
  | { kind: 'ac-bonus'; value: number }
  | {
    kind: 'limited-utility';
    activation: 'action' | 'bonus' | 'reaction' | 'special';
    uses: { max: number; recovery: 'lr' | 'sr' };
    consumption: number;
    chatFlavor: string;
  };

export interface SpeciesFeaturePart {
  id: string;
  level: number;
  automation: SpeciesAutomation;
  mechanics: SpeciesMechanic[];
}

export interface SpeciesFeature {
  id: string;
  name: string;
  englishName?: string;
  description: string;
  parts: SpeciesFeaturePart[];
}

export interface CanonicalSpecies {
  schemaVersion: 1;
  name: string;
  englishName: string;
  displayName: string;
  identifier: string;
  rules: '2024';
  creatureType: { value: string; subtype: string };
  size: { options: ['lg'] | ['med'] | ['sm']; hint: string };
  movement: { walk: number };
  senses: { darkvision?: number };
  source: {
    kind: 'private-homebrew';
    sha256: string;
    irRevision: number;
  };
  features: SpeciesFeature[];
  rawSource: string;
}
