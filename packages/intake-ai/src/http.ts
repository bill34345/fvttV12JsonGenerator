/**
 * Minimal transport contract used by the AI Intake provider.
 *
 * Concrete HTTP clients are supplied by delivery/application code. Keeping
 * this structural protocol local prevents Intake from depending on the
 * translation implementation merely to make an HTTP request.
 */
export interface HttpRequest {
  method: 'POST';
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type HttpClient = (url: string, init: HttpRequest) => Promise<HttpResponse>;
