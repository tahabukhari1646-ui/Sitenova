"use client";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { AiFindingCard } from "@/features/ai/components/AiFindingCard";
import { AiLimitations } from "@/features/ai/components/AiLimitations";
import {
  AI_AUTOMATIC_LABEL,
  URGENCY_BADGE_STATUS,
  URGENCY_LABEL,
  formatAiTimestamp,
} from "@/features/ai/utils";
import type { IncidentStatus } from "@/types";
import { useLatestIncidentAiAnalysis, useRunIncidentAiAnalysis } from "../hooks";

// Stage 18.6: AI diagnosis of one stored uptime incident, shown inside its
// IncidentRow when the user opens it. Mirrors SeoAiAnalysisCard's behavior
// (fresh-over-stored, identity-checked, success-only caching, no polling).
// Mounted only while open, so the stored diagnosis is fetched on demand,
// never once per incident on page load.
// Stage 18.9: findings and limitations render through the shared
// AiFindingCard / AiLimitations components (identical markup to the former
// local copies). Plain React text throughout.

interface IncidentAiPanelProps {
  websiteId: string;
  incidentId: string;
  incidentStatus: IncidentStatus;
}

export function IncidentAiPanel({ websiteId, incidentId, incidentStatus }: IncidentAiPanelProps) {
  const { analyze, analysis, requestedIncidentId, isPending, isError, error, reset } =
    useRunIncidentAiAnalysis(websiteId);
  const {
    analysis: storedAnalysis,
    isLoading: storedIsLoading,
    isError: storedIsError,
  } = useLatestIncidentAiAnalysis(websiteId, incidentId, true);

  // Identity safety: only results/errors for THIS incident are ever shown.
  const isPendingForCurrent = isPending && requestedIncidentId === incidentId;
  const freshForCurrent = analysis && analysis.incidentId === incidentId ? analysis : null;
  const storedForCurrent =
    storedAnalysis && storedAnalysis.incidentId === incidentId ? storedAnalysis : null;
  const resultForCurrent = freshForCurrent ?? storedForCurrent;
  const errorForCurrent = isError && requestedIncidentId === incidentId ? error : null;
  const showStoredLoadError = storedIsError && !resultForCurrent;

  const buttonLabel = isPendingForCurrent
    ? "Analyzing..."
    : resultForCurrent
      ? "Analyze again"
      : "Analyze with AI";

  function handleAnalyze() {
    reset();
    analyze(incidentId);
  }

  const output =
    resultForCurrent?.status === "SUCCEEDED" && resultForCurrent.output !== null
      ? resultForCurrent.output
      : null;

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">AI incident diagnosis</h3>
        <p className="text-xs text-muted-foreground">
          Based only on Sentinel&apos;s stored check results. Failure reasons aren&apos;t
          recorded and checks run from one location.
        </p>
        {incidentStatus === "OPEN" && (
          <p className="text-xs text-muted-foreground">
            This incident is still ongoing — the diagnosis reflects data up to when it was run.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          onClick={handleAnalyze}
          disabled={isPendingForCurrent}
        >
          {buttonLabel}
        </Button>
        {isPendingForCurrent && (
          <p className="text-xs text-muted-foreground">This can take a few seconds.</p>
        )}
        {storedIsLoading && !resultForCurrent && !isPendingForCurrent && (
          <p className="text-xs text-muted-foreground">Loading previous analysis...</p>
        )}
      </div>

      {errorForCurrent && (
        <p role="alert" className="text-sm text-destructive">
          {errorForCurrent}
        </p>
      )}

      {showStoredLoadError && (
        <p className="text-xs text-muted-foreground">Couldn&apos;t load the previous analysis.</p>
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
              No specific findings were identified for this incident.
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
            Provider: {resultForCurrent.provider} · {formatAiTimestamp(resultForCurrent.createdAt)}
            {resultForCurrent.trigger === "AUTOMATIC" && ` · ${AI_AUTOMATIC_LABEL}`}
          </p>
        </div>
      )}
    </div>
  );
}
