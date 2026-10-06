"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { createWebsite } from "../api";
import { websitesKeys } from "../hooks";
import type { WebsiteFormValues } from "./WebsiteForm";
import { WebsiteFormPanel } from "./WebsiteFormPanel";

interface AddWebsiteButtonProps {
  label?: string;
}

export function AddWebsiteButton({ label = "Add website" }: AddWebsiteButtonProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(values: WebsiteFormValues) {
    setIsSubmitting(true);
    setFormError(null);

    try {
      await createWebsite({
        url: values.url,
        name: values.name.trim(),
        platform: values.platform.trim(),
      });
      setOpen(false);
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

  return (
    <>
      <Button
        onClick={() => {
          setFormError(null);
          setOpen(true);
        }}
      >
        <Plus className="size-4" />
        {label}
      </Button>
      <WebsiteFormPanel
        open={open}
        onOpenChange={setOpen}
        mode="create"
        isSubmitting={isSubmitting}
        apiError={formError}
        onSubmit={handleSubmit}
      />
    </>
  );
}
