export type GeneratedDocumentKind = 'actor' | 'item';
export type ConversionStatus = 'accepted' | 'needs_review' | 'failed';

export interface GeneratedArtifactIdentity {
  kind: GeneratedDocumentKind;
  sourcePath?: string;
  outputPath?: string;
  name: string;
  itemCount: number;
}
