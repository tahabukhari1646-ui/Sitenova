"use client";

// Stage 18.9: the ONE "What we can't confirm" list, shared by the SEO card
// and the uptime incident panel (previously two identical copies). Renders
// nothing when there are no limitations. Plain text only.
export function AiLimitations({ limitations }: { limitations: string[] }) {
  if (limitations.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        What we can&apos;t confirm
      </span>
      <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
        {limitations.map((item, index) => (
          <li key={index} className="break-words">
            • {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
