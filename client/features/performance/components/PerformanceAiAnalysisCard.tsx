"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { AiFindingCard } from "@/features/ai/components/AiFindingCard";
import {
  AI_AUTOMATIC_LABEL,
  URGENCY_BADGE_STATUS,
  URGENCY_LABEL,
  formatAiTimestamp,
} from "@/features/ai/utils";
import { useLatestPerformanceAiAnalysis, useRunPerformanceAiAnalysis } from "../hooks";

interface PerformanceAiAnalysisCardProps {
  websiteId: string;
  // null = no PerformanceCheck id is currently available for the selected
  // page+strategy (no test has ever been run yet, or the id is still
  // loading) -- there is nothing a click could target, so the button stays
  // disabled rather than guessing or sending an empty/invalid id.
  performanceCheckId: string | null;
}

// Stage 18.9: findings render through the shared AiFindingCard (identical
// markup to this card's former local copy). Plain React text throughout --
// AI output is untrusted display text regardless of backend validation.
export function PerformanceAiAnalysisCard({
  websiteId,
  performanceCheckId,
}: PerformanceAiAnalysisCardProps) {
  const { analyze, analysis, requestedCheckId, isPending, isError, error, reset } =
    useRunPerformanceAiAnalysis(websiteId);
  // Stage 18.2: the stored latest SUCCEEDED analysis for this exact check,
  // so a result survives a page reload. Read-only; never triggers analysis.
  const { analysis: storedAnalysis, isError: storedIsError } = useLatestPerformanceAiAnalysis(
    websiteId,
    performanceCheckId
  );

  // Stage 16.4 §19/§20 identity safety: a pending/result/error state is
  // only ever shown if it actually belongs to the CURRENTLY selected check.
  // If the page/strategy context changes (or a late response from an
  // earlier request arrives after the user already moved on), none of
  // these derived values match the new `performanceCheckId`, so the card
  // silently falls back to its initial "Analyze with AI" state instead of
  // ever displaying another check's result under the wrong one.
  const isPendingForCurrent = isPending && requestedCheckId === performanceCheckId;
  // Stage 18.2: a fresh click result for the current check wins; otherwise
  // the stored latest -- and BOTH are identity-checked against the current
  // check id (the stored query is also keyed by it), so a stale result for a
  // previously selected check can never be shown under the new one.
  const freshForCurrent =
    analysis && analysis.performanceCheckId === performanceCheckId ? analysis : null;
  const storedForCurrent =
    storedAnalysis && storedAnalysis.performanceCheckId === performanceCheckId
      ? storedAnalysis
      : null;
  const resultForCurrent = freshForCurrent ?? storedForCurrent;
  const errorForCurrent = isError && requestedCheckId === performanceCheckId ? error : null;
  // Only shown when there is nothing else to show -- never blocks "Analyze".
  const showStoredLoadError = storedIsError && Boolean(performanceCheckId) && !resultForCurrent;

  const hasResult = resultForCurrent !== null;
  const buttonLabel = isPendingForCurrent
    ? "Analyzing..."
    : hasResult
      ? "Analyze again"
      : "Analyze with AI";

  function handleAnalyze() {
    if (!performanceCheckId) return;
    reset();
    analyze(performanceCheckId);
  }

  // Stage 16.3's actual behavior (verified, not assumed): a provider/
  // config/timeout failure or an invalid structured response NEVER reaches
  // the frontend as a successful {status: FAILED | INVALID_RESPONSE} body
  // -- the backend throws an AiAnalysisError (502) in every one of those
  // cases, which surfaces here as `isError`/`error` instead. This
  // SUCCEEDED-only guard is therefore purely defensive -- it is never
  // expected to be exercised by the current backend -- but is kept so this
  // component can never render null output as if it were a successful
  // analysis if that contract ever changes.
  const showSuccess = resultForCurrent?.status === "SUCCEEDED" && resultForCurrent.output !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Performance Analysis</CardTitle>
        <CardDescription>
          Get a plain-English explanation of the current performance results and
          recommended next steps.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={handleAnalyze}
            disabled={!performanceCheckId || isPendingForCurrent}
          >
            {buttonLabel}
          </Button>
          {!performanceCheckId && (
            <p className="text-xs text-muted-foreground">
              Run a performance test first to enable AI analysis.
            </p>
          )}
          {isPendingForCurrent && (
            <p className="text-xs text-muted-foreground">This can take a few seconds.</p>
          )}
        </div>

        {errorForCurrent && (
          <p role="alert" className="text-sm text-destructive">
            {errorForCurrent}
          </p>
        )}

        {showStoredLoadError && (
          <p className="text-xs text-muted-foreground">
            Couldn&apos;t load the previous analysis.
          </p>
        )}

        {showSuccess && resultForCurrent?.output && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="max-w-prose text-sm break-words">{resultForCurrent.output.summary}</p>
              <StatusBadge
                status={URGENCY_BADGE_STATUS[resultForCurrent.output.priority]}
                label={URGENCY_LABEL[resultForCurrent.output.priority]}
              />
            </div>

            {resultForCurrent.output.findings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No significant performance issues were identified from the supplied
                metrics.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {resultForCurrent.output.findings.map((finding, index) => (
                  <AiFindingCard key={index} finding={finding} />
                ))}
              </div>
            )}

            {/* Subtle, provider-independent metadata -- never a "Powered by
                OpenAI" style claim, and never displayed as a product
                message when provider === "mock" (Stage 16.4 §11). */}
            <p className="text-xs text-muted-foreground">
              Provider: {resultForCurrent.provider} · {formatAiTimestamp(resultForCurrent.createdAt)}
              {resultForCurrent.trigger === "AUTOMATIC" && ` · ${AI_AUTOMATIC_LABEL}`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
