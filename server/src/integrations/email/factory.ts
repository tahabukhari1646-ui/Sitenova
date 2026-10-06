import { ResendEmailProvider } from "./resend-provider";
import { MockEmailProvider } from "./mock-provider";
import { EmailProviderError } from "./errors";
import type { EmailProvider } from "./provider";

// Mirrors integrations/ai/factory.ts's DEFAULT_PROVIDER precedent exactly:
// EMAIL_PROVIDER unset defaults to "mock" in development/test -- no paid
// Resend account is required to work on this codebase locally, and
// "missing config reports a clear error only when actually used" is this
// project's established discipline (PAGESPEED_API_KEY, OPENAI_API_KEY).
const DEFAULT_PROVIDER = "mock";

// EMAIL_FROM_NAME has a safe, non-secret default (unlike RESEND_API_KEY/
// EMAIL_FROM, which have no safe default and are checked lazily inside
// ResendEmailProvider.send() itself) -- resolved once here, exactly like
// factory.ts's own OPENAI_MODEL/DEFAULT_MODEL precedent.
const DEFAULT_FROM_NAME = "Sentinel AI";

// A provider whose only behavior is to fail with a controlled, lazy
// configuration error -- used for an unrecognized EMAIL_PROVIDER value,
// and (Stage 16.7 precedent) for a missing EMAIL_PROVIDER in production.
// Mirrors integrations/ai/factory.ts's UnknownAiProvider exactly, so
// getEmailProvider itself still never throws synchronously regardless of
// misconfiguration.
class UnknownEmailProvider implements EmailProvider {
  readonly name = "unknown";
  private readonly message: string;

  constructor(message: string) {
    this.message = message;
  }

  async send(): Promise<never> {
    throw new EmailProviderError("CONFIGURATION_ERROR", this.message);
  }
}

// Stage 17.3 §10: the ONE place the mock-vs-resend-vs-configuration-error
// decision is made -- both getEmailProvider() (constructs a real
// EmailProvider) and resolveEmailProviderName() (Stage 17.3's send-free
// name resolution, used by email-delivery/service.ts to persist which
// provider an intent targets without ever instantiating/calling one) call
// this SAME function, so the two can never disagree about which provider
// is selected. Performs no I/O and never throws.
type EmailProviderSelection =
  | { kind: "mock" }
  | { kind: "resend"; fromName: string }
  | { kind: "configuration_error"; message: string };

function selectEmailProvider(): EmailProviderSelection {
  const rawValue = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  const providerName = rawValue || DEFAULT_PROVIDER;

  // Stage 16.7 precedent, reapplied here rather than reinvented: this
  // codebase's one narrowly-scoped NODE_ENV exception (see
  // integrations/ai/factory.ts's own identical comment). Today (no
  // deployment exists yet, NODE_ENV is never set), `isProduction` is
  // always false and behavior is unchanged from the development default
  // above.
  const isProduction = process.env.NODE_ENV === "production";

  if (providerName === "mock") {
    // An UNSET/missing EMAIL_PROVIDER silently defaulting to mock in
    // production would mean a misconfigured deployment silently discards
    // every outbound email while reporting success -- indistinguishable
    // from the outside. Only the UNSET case is blocked; an EXPLICIT
    // EMAIL_PROVIDER=mock is still honored even in production, since
    // typing it out is itself a deliberate, visible configuration act
    // (e.g. a staging smoke test), exactly matching AI_PROVIDER's own
    // Stage 16.7 policy.
    if (isProduction && !rawValue) {
      return {
        kind: "configuration_error",
        message:
          "EMAIL_PROVIDER is not configured. Refusing to silently use the mock email provider in production -- set EMAIL_PROVIDER explicitly to 'resend', or to 'mock' only if that is truly intended.",
      };
    }
    return { kind: "mock" };
  }

  if (providerName === "resend") {
    const fromName = process.env.EMAIL_FROM_NAME?.trim() || DEFAULT_FROM_NAME;
    return { kind: "resend", fromName };
  }

  return {
    kind: "configuration_error",
    message: `Unknown EMAIL_PROVIDER value: '${providerName}'. Expected 'mock' or 'resend'.`,
  };
}

// Stage 17.5: the one place a definite mock/resend KIND actually becomes
// an EmailProvider instance -- shared by getEmailProvider() (below, after
// selecting from current env config) and getEmailProviderByName() (Stage
// 17.5, after validating an EmailDelivery's own recorded provider name),
// so the construction logic (e.g. resolving EMAIL_FROM_NAME) can never
// drift between the two call paths.
function instantiateProvider(kind: "mock" | "resend"): EmailProvider {
  if (kind === "mock") {
    return new MockEmailProvider();
  }
  const fromName = process.env.EMAIL_FROM_NAME?.trim() || DEFAULT_FROM_NAME;
  return new ResendEmailProvider(fromName);
}

// Stage 17.1 §9/§10/§11: the single creation boundary -- callers get back
// only the provider-independent EmailProvider interface, never a
// ResendEmailProvider/MockEmailProvider/Resend SDK type. Performs no I/O
// and never throws synchronously: reading RESEND_API_KEY/EMAIL_FROM and
// actually calling a provider both stay inside send() (or
// UnknownEmailProvider's own lazy throw above), so creating a provider is
// always safe to do unconditionally, even with zero email configuration
// present.
export function getEmailProvider(): EmailProvider {
  const selection = selectEmailProvider();

  if (selection.kind === "configuration_error") {
    return new UnknownEmailProvider(selection.message);
  }

  return instantiateProvider(selection.kind);
}

// Stage 17.3: resolves ONLY the provider's name -- no I/O, and critically,
// never constructs a provider or calls send(). Used by
// email-delivery/service.ts's createEmailIntentForAlert to persist which
// provider an EmailDelivery intent targets, entirely without requiring
// RESEND_API_KEY/EMAIL_FROM to be configured (those stay lazy, checked
// only inside ResendEmailProvider.send() itself, per Stage 17.1 -- an
// Alert transaction creating intent must never be turned into Resend
// credential validation).
export function resolveEmailProviderName():
  | { ok: true; name: string }
  | { ok: false; message: string } {
  const selection = selectEmailProvider();

  if (selection.kind === "configuration_error") {
    return { ok: false, message: selection.message };
  }

  return { ok: true, name: selection.kind };
}

// Stage 17.5 §4/§5: resolves a provider by an EmailDelivery row's OWN
// recorded `provider` string -- deliberately independent of the CURRENT
// process.env.EMAIL_PROVIDER value. An EmailDelivery's provider was
// decided once, at Alert-creation time (Stage 17.3's event-time identity
// rule); the worker must honor that recorded value even if the
// environment's configured provider has since changed, and must NEVER
// consult/override it with selectEmailProvider()'s current-env decision.
//
// Only "mock"/"resend" (the only two names createEmailIntentForAlert ever
// writes) are recognized -- any other stored value is a data-integrity
// anomaly, not a configuration choice, so it resolves to a provider whose
// send() lazily throws CONFIGURATION_ERROR, exactly like an unrecognized
// EMAIL_PROVIDER env value does today. (Stage 17.5's worker itself checks
// for this exact case BEFORE even calling this function, so it can
// persist the more specific UNKNOWN_PROVIDER code -- this fallback exists
// only as defense-in-depth, not as the primary path.)
export function getEmailProviderByName(name: string): EmailProvider {
  if (name === "mock" || name === "resend") {
    return instantiateProvider(name);
  }

  return new UnknownEmailProvider(
    `Unknown stored EmailDelivery.provider value: '${name}'. Expected 'mock' or 'resend'.`
  );
}
