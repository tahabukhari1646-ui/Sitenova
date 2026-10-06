import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { SeoCheckRecord } from "../types";
import { discoveryBadgeStatus, formatDiscoveryStatus, formatOrNotSet } from "../utils";

interface SeoTechnicalDetailsProps {
  check: SeoCheckRecord;
}

function DiscoveryValue({ found, url }: { found: boolean | null; url: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <StatusBadge status={discoveryBadgeStatus(found)} label={formatDiscoveryStatus(found)} />
      {found === true && url && (
        <span className="break-all text-xs text-muted-foreground">{url}</span>
      )}
    </div>
  );
}

export function SeoTechnicalDetails({ check }: SeoTechnicalDetailsProps) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-muted-foreground">Page</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="HTTP Status" value={String(check.statusCode)} />
        <StatCard label="Word Count" value={String(check.wordCount)} />
        <StatCard label="Internal Links" value={String(check.internalLinkCount)} />
        <StatCard label="External Links" value={String(check.externalLinkCount)} />
        <StatCard label="Images" value={String(check.imageCount)} />
        <StatCard label="Missing Alt" value={String(check.imagesMissingAltCount)} />
        <StatCard
          label="Requested URL"
          value={<span className="break-all text-xs">{check.requestedUrl}</span>}
        />
        <StatCard
          label="Final URL"
          value={<span className="break-all text-xs">{check.finalUrl}</span>}
        />
      </div>

      <h3 className="text-sm font-medium text-muted-foreground">Robots &amp; Discovery</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard
          label="Meta Robots"
          value={
            <span className={check.robotsMeta === null ? "text-muted-foreground" : ""}>
              {formatOrNotSet(check.robotsMeta)}
            </span>
          }
        />
        <StatCard
          label="X-Robots-Tag"
          value={
            <span className={check.xRobotsTag === null ? "text-muted-foreground" : ""}>
              {formatOrNotSet(check.xRobotsTag)}
            </span>
          }
        />
        <StatCard
          label="robots.txt"
          value={<DiscoveryValue found={check.robotsTxtFound} url={check.robotsTxtUrl} />}
        />
        <StatCard
          label="Sitemap"
          value={<DiscoveryValue found={check.sitemapFound} url={check.sitemapUrl} />}
        />
      </div>

      <h3 className="text-sm font-medium text-muted-foreground">Structured Data</h3>
      <p className="text-xs text-muted-foreground">
        Basic JSON-LD detection only — this does not confirm valid Schema.org
        markup or eligibility for search engine rich results.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="JSON-LD Blocks" value={String(check.structuredData.jsonLdCount)} />
        <StatCard
          label="Detected Types"
          value={
            check.structuredData.types.length > 0 ? (
              <span className="break-words">{check.structuredData.types.join(", ")}</span>
            ) : (
              <span className="text-muted-foreground">None detected</span>
            )
          }
        />
        <StatCard label="Invalid Blocks" value={String(check.structuredData.invalidCount)} />
      </div>
    </div>
  );
}
