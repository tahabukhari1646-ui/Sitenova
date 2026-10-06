"use client";

import { LayoutDashboard } from "lucide-react";

import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingState } from "@/components/shared/LoadingState";
import { Button } from "@/components/ui/button";
import { AddWebsiteButton } from "@/features/websites/components/AddWebsiteButton";
import { SummaryCards } from "@/features/dashboard/components/SummaryCards";
import { WebsiteOverviewItem } from "@/features/dashboard/components/WebsiteOverviewItem";
import { useWebsiteStatuses } from "@/features/monitoring/hooks";
import { getUptimeStatus } from "@/features/monitoring/utils";
import { useWebsites } from "@/features/websites/hooks";

export default function DashboardPage() {
  const { websites, isLoading, error, refetch } = useWebsites();
  const ids = websites.map((website) => website.id);
  const statuses = useWebsiteStatuses(ids);

  if (isLoading) {
    return (
      <PageContainer title="Dashboard">
        <LoadingState label="Loading your dashboard..." />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer title="Dashboard">
        <ErrorState
          description={error}
          action={<Button onClick={() => refetch()}>Retry</Button>}
        />
      </PageContainer>
    );
  }

  if (websites.length === 0) {
    return (
      <PageContainer
        title="Dashboard"
        description="An at-a-glance overview of your monitored websites."
      >
        <EmptyState
          icon={LayoutDashboard}
          title="No websites yet"
          description="Add your first website to start monitoring it with Sentinel AI."
          action={<AddWebsiteButton label="Add a website" />}
        />
      </PageContainer>
    );
  }

  const isStatusLoading = statuses.some((status) => status.isLoading);
  const upCount = statuses.filter(
    (status) => getUptimeStatus(status.check) === "up"
  ).length;
  const downCount = statuses.filter(
    (status) => getUptimeStatus(status.check) === "down"
  ).length;
  const activeCount = websites.filter((website) => website.isActive).length;

  return (
    <PageContainer
      title="Dashboard"
      description="An at-a-glance overview of your monitored websites."
      actions={<AddWebsiteButton />}
    >
      <SummaryCards
        total={websites.length}
        active={activeCount}
        up={upCount}
        down={downCount}
        isStatusLoading={isStatusLoading}
      />

      <div className="mt-6 flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Your websites
        </h2>
        {websites.map((website) => {
          const status = statuses.find((entry) => entry.id === website.id);
          return (
            <WebsiteOverviewItem
              key={website.id}
              website={website}
              check={status?.check ?? null}
              isStatusLoading={status?.isLoading ?? true}
            />
          );
        })}
      </div>
    </PageContainer>
  );
}
