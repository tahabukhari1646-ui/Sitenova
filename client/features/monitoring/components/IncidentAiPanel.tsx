"use client";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import type { PerformanceAiFinding } from "@/features/performance/types";
import {
  CONFIDENCE_LABEL,
  URGENCY_BADGE_STATUS,
  URGENCY_LABEL,
  formatAiTimestamp,
} from "@/features/performance/utils";
import type { IncidentStatus } from "@/types";
import { useLatestIncidentAiAnalysis, useRunIncidentAiAnalysis } from "../hooks";

// Stage 18.6: AI diagnosis of one stored uptime incident, shown inside its
// IncidentRow when the user opens it. Mirrors SeoAiAnalysisCard's behavior
// (fresh-over-stored, identity-checked, success-only caching, no polling).
// Mounted only while open, so the stored diagnosis is fetched on demand,
// never once per incident on page load. Deliberately its own finding
// renderer for now -- all three AI finding layouts are consolidated in a
// later stage.

interface IncidentAiPanelProps {
  websiteId: string;
  incidentId: string;
  incidentStatus: IncidentStatus;
}

// Plain React text throughout -- never dangerouslySetInnerHTML. AI output
// is untrusted display text regardless of backend validation.
function IncidentFindingCard({ finding }: { finding: PerformanceAiFinding }) {
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
        {/* "Possible explanation", never "Root cause" -- INFERENCE only. */}
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
                <IncidentFindingCard key={index} finding={finding} />
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
            Provider: {resultForCurrent.provider} · {formatAiTimestamp(resultForCurrent.createdAt)}
          </p>
        </div>
      )}
    </div>
  );
}
