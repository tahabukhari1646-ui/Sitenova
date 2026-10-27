"use client";

import { StatusBadge } from "@/components/shared/StatusBadge";
import type { AiFinding } from "../types";
import { CONFIDENCE_LABEL, URGENCY_BADGE_STATUS, URGENCY_LABEL } from "../utils";

// Stage 18.9: the ONE AI finding layout, shared by the Performance card, the
// SEO card and the uptime incident panel (previously three identical
// copies). Markup is unchanged from those copies.
//
// Plain React text throughout -- every string here is rendered as-is
// (never dangerouslySetInnerHTML, never parsed as HTML/Markdown). AI
// output is untrusted display text regardless of backend validation
// (Stage 16.4 §23).
export function AiFindingCard({ finding }: { finding: AiFinding }) {
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
            not a confirmed diagnosis (Stage 16.4 §14). */}
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
