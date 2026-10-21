import { OpenAiProvider } from "./openai-provider";
import { MockAiProvider } from "./mock-provider";
import { AiProviderError } from "./errors";
import type { AiProvider } from "./provider";

// The ONE place the literal default model name is allowed to appear (Stage
// 16.2 §2) -- every other file reaches the configured model only through
// an AiProvider instance's `.model` property, never this constant directly.
const DEFAULT_MODEL = "gpt-5-mini";

// Stage 16.3: AI_PROVIDER unset defaults to "mock" -- deliberately, not
// "openai". The user does not currently have a paid OpenAI API key, and
// this codebase's own established discipline (PAGESPEED_API_KEY, and
// Stage 16.2's own OPENAI_API_KEY) is "missing config reports a clear
// error only when actually used," never "silently do something expensive
// unprompted." Defaulting to mock keeps local development safe without
// requiring every contributor to remember to set this explicitly.
const DEFAULT_PROVIDER = "mock";

// A provider whose only behavior is to fail with a controlled, lazy
// configuration error -- used for an unrecognized AI_PROVIDER value, and
// (Stage 16.7) for a missing AI_PROVIDER in production. Mirrors
// OpenAiProvider's own "never throw at construction, only when analysis is
// actually requested" discipline exactly, so createAiProvider itself still
// never throws synchronously regardless of misconfiguration.
class UnknownAiProvider implements AiProvider {
  readonly name = "unknown";
  readonly model = "unknown";
  private readonly message: string;

  constructor(message: string) {
    this.message = message;
  }

  async analyzePerformance(): Promise<never> {
    throw new AiProviderError("CONFIGURATION_ERROR", this.message);
  }

  // Stage 18.3: identical lazy configuration failure for SEO.
  async analyzeSeo(): Promise<never> {
    throw new AiProviderError("CONFIGURATION_ERROR", this.message);
  }

  // Stage 18.5: identical lazy configuration failure for uptime incidents.
  async analyzeIncident(): Promise<never> {
    throw new AiProviderError("CONFIGURATION_ERROR", this.message);
  }
}

// Stage 16.2 §11 / Stage 16.3 §6: the single creation boundary -- callers
// get back only the provider-independent AiProvider interface, never an
// OpenAiProvider/MockAiProvider/OpenAI SDK type. Only two real providers
// exist today (no multi-provider registry) -- a future Gemini/Anthropic
// provider would be added as another branch here, without any domain code
// changing, since domain code only ever sees AiProvider.
//
// Performs no I/O and never throws: reading OPENAI_API_KEY and actually
// calling a provider both stay inside analyzePerformance (or
// UnknownAiProvider's own lazy throw above), so creating a provider is
// always safe to do unconditionally without requiring AI to be configured.
export function createAiProvider(): AiProvider {
  const rawValue = process.env.AI_PROVIDER?.trim().toLowerCase();
  const providerName = rawValue || DEFAULT_PROVIDER;

  // Stage 16.7 §21: this codebase has no existing NODE_ENV convention
  // anywhere else (confirmed by inspection) -- this is the one, narrowly
  // scoped exception, using Node's own standard environment variable
  // rather than inventing a project-specific config concept. Today (no
  // deployment exists yet, NODE_ENV is never set), `isProduction` is
  // always false and behavior is completely unchanged from Stage 16.3.
  const isProduction = process.env.NODE_ENV === "production";

  if (providerName === "mock") {
    // An UNSET/missing AI_PROVIDER silently defaulting to mock is a
    // reasonable, documented development convenience (Stage 16.3 §6), but
    // the exact same silent default in production would mean a
    // misconfigured deployment serves deterministic mock findings to real
    // users as if they were genuine AI analysis -- indistinguishable from
    // the outside. Only the UNSET case is blocked here; an EXPLICIT
    // AI_PROVIDER=mock is still honored even in production, since typing
    // it out is itself a deliberate, visible configuration act (e.g. a
    // staging smoke test), not an accidental fallback.
    if (isProduction && !rawValue) {
      return new UnknownAiProvider(
        "AI_PROVIDER is not configured. Refusing to silently use the mock AI provider in production -- set AI_PROVIDER explicitly to 'openai', or to 'mock' only if that is truly intended."
      );
    }
    return new MockAiProvider();
  }

  if (providerName === "openai") {
    const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
    return new OpenAiProvider(model);
  }

  return new UnknownAiProvider(
    `Unknown AI_PROVIDER value: '${providerName}'. Expected 'mock' or 'openai'.`
  );
}
