// Stage 16.2: mirrors utils/safeFetch.ts's SafeFetchError pattern exactly --
// a plain Error (not AppError) with a `code` discriminator, because "a
// future caller will want to react very differently" per error category
// (Stage 16.3's HTTP layer will decide the status-code mapping later, the
// same way seo/service.ts's mapSafeFetchError does for SafeFetchError
// today) -- this generic integration boundary should not hardcode an HTTP
// status itself.
export type AiProviderErrorCode =
  | "CONFIGURATION_ERROR" // missing/invalid API key -- never reachable without a request being attempted
  | "TIMEOUT" // the request did not complete within the configured timeout
  | "PROVIDER_UNAVAILABLE" // network failure, rate limit, or any other provider-side failure
  | "INVALID_RESPONSE"; // the provider responded, but its output failed Stage 16.1 validation (or wasn't parseable JSON)

export class AiProviderError extends Error {
  code: AiProviderErrorCode;

  constructor(code: AiProviderErrorCode, message: string) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
  }
}
