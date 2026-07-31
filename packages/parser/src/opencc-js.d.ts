/** Exact third-party surface consumed by the parser package. */
declare module 'opencc-js' {
  export interface ConverterOptions {
    from: string;
    to: string;
  }

  export function Converter(options: ConverterOptions): (text: string) => string;
}
