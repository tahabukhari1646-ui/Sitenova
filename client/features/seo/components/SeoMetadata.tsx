import { StatCard } from "@/components/shared/StatCard";
import type { SeoCheckRecord } from "../types";
import { formatOrNotSet } from "../utils";

interface SeoMetadataProps {
  check: SeoCheckRecord;
}

function TextValue({ value, breakAll = false }: { value: string | null; breakAll?: boolean }) {
  return (
    <span className={breakAll ? "break-all" : "break-words"}>
      {value === null ? (
        <span className="text-muted-foreground">{formatOrNotSet(value)}</span>
      ) : (
        value
      )}
    </span>
  );
}

export function SeoMetadata({ check }: SeoMetadataProps) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-muted-foreground">Metadata</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Title" value={<TextValue value={check.title} />} />
        <StatCard label="Meta Description" value={<TextValue value={check.metaDescription} />} />
        <StatCard label="Canonical URL" value={<TextValue value={check.canonicalUrl} breakAll />} />
      </div>

      <h3 className="text-sm font-medium text-muted-foreground">Headings</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="H1 Count" value={String(check.h1Count)} />
        <StatCard label="First H1" value={<TextValue value={check.h1Text} />} />
        <StatCard label="H2 Count" value={String(check.h2Count)} />
        <StatCard label="H3 Count" value={String(check.h3Count)} />
      </div>
    </div>
  );
}
