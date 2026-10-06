"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Globe } from "lucide-react";
import { useState } from "react";

import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingState } from "@/components/shared/LoadingState";
import { AddWebsiteButton } from "@/features/websites/components/AddWebsiteButton";
import { deleteWebsite, updateWebsite } from "@/features/websites/api";
import type { WebsiteFormValues } from "@/features/websites/components/WebsiteForm";
import { WebsiteFormPanel } from "@/features/websites/components/WebsiteFormPanel";
import { WebsiteRow } from "@/features/websites/components/WebsiteRow";
import { useWebsites, websitesKeys } from "@/features/websites/hooks";
import { ApiError } from "@/lib/api-client";
import type { Website } from "@/types";

export default function WebsitesPage() {
  const { websites, isLoading, error } = useWebsites();
  const queryClient = useQueryClient();
  const [editingWebsite, setEditingWebsite] = useState<Website | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function openEditPanel(website: Website) {
    setFormError(null);
    setEditingWebsite(website);
  }

  async function handleSubmit(values: WebsiteFormValues) {
    if (!editingWebsite) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      await updateWebsite(editingWebsite.id, {
        url: values.url,
        name: values.name.trim(),
        platform: values.platform.trim(),
        isActive: values.isActive,
      });

      setEditingWebsite(null);
      await queryClient.invalidateQueries({ queryKey: websitesKeys.all });
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(website: Website) {
    await deleteWebsite(website.id);
    await queryClient.invalidateQueries({ queryKey: websitesKeys.all });
  }

  return (
    <PageContainer
      title="Websites"
      description="Manage the websites Sentinel AI is monitoring."
      actions={<AddWebsiteButton />}
    >
      {isLoading ? (
        <LoadingState label="Loading your websites..." />
      ) : error ? (
        <ErrorState description={error} />
      ) : websites.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No websites yet"
          description="Add your first website to start monitoring it with Sentinel AI."
          action={<AddWebsiteButton />}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {websites.map((website) => (
            <WebsiteRow
              key={website.id}
              website={website}
              onEdit={() => openEditPanel(website)}
              onDelete={() => handleDelete(website)}
            />
          ))}
        </div>
      )}

      <WebsiteFormPanel
        open={editingWebsite !== null}
        onOpenChange={(open) => {
          if (!open) setEditingWebsite(null);
        }}
        mode="edit"
        website={editingWebsite ?? undefined}
        isSubmitting={isSubmitting}
        apiError={formError}
        onSubmit={handleSubmit}
      />
    </PageContainer>
  );
}
