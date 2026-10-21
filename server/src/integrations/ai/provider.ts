import type {
  DiagnosisAiOutput,
  PerformanceAiInput,
  PerformanceAiOutput,
  SeoAiInput,
} from "../../modules/ai-analysis/types";

// Stage 16.2: the provider-independent boundary. Domain/business code
// (Stage 16.3's future service.ts) must depend only on this interface --
// never on an OpenAI SDK type, a Responses API shape, or any other
// vendor-specific object. Mirrors this codebase's existing
// integration-boundary precedent (integrations/pagespeed.ts's
// runPageSpeedCheck -- a plain async function returning a plain domain
// type, with every PSI-specific detail staying inside that one file).
export interface AiProvider {
  readonly name: string;
  readonly model: string;

  // Always resolves to an already-validated PerformanceAiOutput (Stage
  // 16.1's runtime validator has already accepted it) or rejects with an
  // AiProviderError -- never returns partially-validated or raw provider
  // data to the caller.
  analyzePerformance(input: PerformanceAiInput): Promise<PerformanceAiOutput>;

  // Stage 18.3: same contract for one stored SEO check -- resolves to an
  // already-validated DiagnosisAiOutput (diagnosis-validation.ts) or rejects
  // with an AiProviderError.
  analyzeSeo(input: SeoAiInput): Promise<DiagnosisAiOutput>;
}
