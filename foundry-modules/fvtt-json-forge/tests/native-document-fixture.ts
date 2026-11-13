/** Identity-only receiver for UI unit tests; the installed schema is verified separately in Foundry. */
export class NativeDocumentFixture {
  constructor(private readonly source:unknown) {}
  validate(){return true;}
  toObject(){return structuredClone(this.source);}
}
