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
import type { PerformanceAiFinding } from "@/features/performance/types";
import {
  CONFIDENCE_LABEL,
  URGENCY_BADGE_STATUS,
  URGENCY_LABEL,
  formatAiTimestamp,
} from "@/features/performance/utils";
import { useLatestSeoAiAnalysis, useRunSeoAiAnalysis } from "../hooks";

// Stage 18.4: AI diagnosis of one stored SEO check -- mirrors
// PerformanceAiAnalysisCard's behavior (Stage 16.4 / 18.2) exactly, plus a
// "What we can't confirm" section for the diagnosis `limitations`.
// Deliberately its own finding renderer (not a shared component yet) so the
// Performance card stays untouched in this stage.

interface SeoAiAnalysisCardProps {
  websiteId: string;
  // null = no SEO check exists yet for the selected page -- nothing a click
  // could target, so the button stays disabled.
  seoCheckId: string | null;
}

// Plain React text throughout -- never dangerouslySetInnerHTML, never parsed
// as HTML/Markdown. AI output is untrusted display text regardless of
// backend validation.
function SeoFindingCard({ finding }: { finding: PerformanceAiFinding }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-sm font-medium break-words">{finding.title}</h4>
        <StatusBadge
          status={URGENCY_BADGE_STATUS[finding.severity]}
          label={URGENCY_LABEL[finding.severity]}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Evidence
        </span>
        <ul className="flex flex-col gap-0.5 text-sm">
          {finding.evidence.map((item, index) => (
            <li key={index} className="break-words">
              • {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-1">
        {/* "Possible explanation", never "Root cause" -- this is INFERENCE,
            not a confirmed diagnosis. */}
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Possible explanation
        </span>
        <p className="text-sm break-words text-muted-foreground">{finding.explanation}</p>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="font-medium tracking-wide uppercase">Confidence</span>
        <span>{CONFIDENCE_LABEL[finding.confidence]}</span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Recommended actions
        </span>
        <ul className="flex flex-col gap-0.5 text-sm">
          {finding.recommendations.map((item, index) => (
            <li key={index} className="break-words">
              • {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
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
                  <SeoFindingCard key={index} finding={finding} />
                ))}
              </div>
            )}

            {output.limitations.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  What we can&apos;t confirm
                </span>
                <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
                  {output.limitations.map((item, index) => (
                    <li key={index} className="break-words">
                      • {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
