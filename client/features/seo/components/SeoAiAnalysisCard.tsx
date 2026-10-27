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
import { AiLimitations } from "@/features/ai/components/AiLimitations";
import { URGENCY_BADGE_STATUS, URGENCY_LABEL, formatAiTimestamp } from "@/features/ai/utils";
import { useLatestSeoAiAnalysis, useRunSeoAiAnalysis } from "../hooks";

// Stage 18.4: AI diagnosis of one stored SEO check -- mirrors
// PerformanceAiAnalysisCard's behavior (Stage 16.4 / 18.2) exactly, plus a
// "What we can't confirm" section for the diagnosis `limitations`.
// Stage 18.9: findings and limitations render through the shared
// AiFindingCard / AiLimitations components (identical markup to the former
// local copies). Plain React text throughout.

interface SeoAiAnalysisCardProps {
  websiteId: string;
  // null = no SEO check exists yet for the selected page -- nothing a click
  // could target, so the button stays disabled.
  seoCheckId: string | null;
}

export function SeoAiAnalysisCard({ websiteId, seoCheckId }: SeoAiAnalysisCardProps) {
  const { analyze, analysis, requestedCheckId, isPending, isError, error, reset } =
    useRunSeoAiAnalysis(websiteId);
  // Stored latest SUCCEEDED diagnosis for this exact check (survives reload).
  const { analysis: storedAnalysis, isError: storedIsError } = useLatestSeoAiAnalysis(
    websiteId,
    seoCheckId
  );

  // Identity safety: pending/result/error state is only shown if it belongs
  // to the CURRENTLY selected check. A fresh click result wins; otherwise the
  // stored latest -- BOTH matched against the current check id, so a result
  // for a previously selected (or replaced) check can never be shown.
  const isPendingForCurrent = isPending && requestedCheckId === seoCheckId;
  const freshForCurrent = analysis && analysis.seoCheckId === seoCheckId ? analysis : null;
  const storedForCurrent =
    storedAnalysis && storedAnalysis.seoCheckId === seoCheckId ? storedAnalysis : null;
  const resultForCurrent = freshForCurrent ?? storedForCurrent;
  const errorForCurrent = isError && requestedCheckId === seoCheckId ? error : null;
  // Only shown when there is nothing else to show -- never blocks "Analyze".
  const showStoredLoadError = storedIsError && Boolean(seoCheckId) && !resultForCurrent;

  const buttonLabel = isPendingForCurrent
    ? "Analyzing..."
    : resultForCurrent
      ? "Analyze again"
      : "Analyze with AI";

  function handleAnalyze() {
    if (!seoCheckId) return;
    reset();
    analyze(seoCheckId);
  }

  // Defensive: provider failures reach the UI as a 502 error (isError), never
  // as a successful {status: FAILED} body -- but never render null output as
  // if it were a successful diagnosis.
  const output =
    resultForCurrent?.status === "SUCCEEDED" && resultForCurrent.output !== null
      ? resultForCurrent.output
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI SEO Diagnosis</CardTitle>
        <CardDescription>
          Get a plain-English explanation of this page&apos;s SEO issues and recommended next
          steps.
        </CardDescription>
        <p className="text-xs text-muted-foreground">
          Based only on Sentinel&apos;s stored check data — page text, rankings and traffic
          aren&apos;t used.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={handleAnalyze}
            disabled={!seoCheckId || isPendingForCurrent}
          >
            {buttonLabel}
          </Button>
          {!seoCheckId && (
            <p className="text-xs text-muted-foreground">
              Run an SEO check first to enable AI analysis.
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

        {output && resultForCurrent && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="max-w-prose text-sm break-words">{output.summary}</p>
              <StatusBadge
                status={URGENCY_BADGE_STATUS[output.priority]}
                label={URGENCY_LABEL[output.priority]}
              />
            </div>

            {output.findings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No SEO errors or warnings were identified from this check.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {output.findings.map((finding, index) => (
                  <AiFindingCard key={index} finding={finding} />
                ))}
              </div>
            )}

            <AiLimitations limitations={output.limitations} />

            <p className="text-xs text-muted-foreground">
              Provider: {resultForCurrent.provider} ·{" "}
              {formatAiTimestamp(resultForCurrent.createdAt)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
