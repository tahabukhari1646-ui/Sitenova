"use client";

import { useId, useState, type SubmitEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Website } from "@/types";

export interface WebsiteFormValues {
  url: string;
  name: string;
  platform: string;
  isActive: boolean;
}

interface WebsiteFormProps {
  mode: "create" | "edit";
  initialWebsite?: Website;
  isSubmitting: boolean;
  apiError: string | null;
  onSubmit: (values: WebsiteFormValues) => void;
  onCancel: () => void;
}

function toFormValues(website?: Website): WebsiteFormValues {
  return {
    url: website?.url ?? "",
    name: website?.name ?? "",
    platform: website?.platform ?? "",
    isActive: website?.isActive ?? true,
  };
}

export function WebsiteForm({
  mode,
  initialWebsite,
  isSubmitting,
  apiError,
  onSubmit,
  onCancel,
}: WebsiteFormProps) {
  const [values, setValues] = useState<WebsiteFormValues>(() =>
    toFormValues(initialWebsite)
  );
  const [fieldError, setFieldError] = useState<string | null>(null);
  const activeId = useId();

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const url = values.url.trim();
    if (url.length === 0) {
      setFieldError("URL is required.");
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setFieldError("Include the protocol, e.g. https://example.com");
      return;
    }
    setFieldError(null);
    onSubmit({ ...values, url });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="url">Website URL</Label>
        <Input
          id="url"
          type="url"
          placeholder="https://example.com"
          value={values.url}
          onChange={(event) =>
            setValues((v) => ({ ...v, url: event.target.value }))
          }
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name (optional)</Label>
        <Input
          id="name"
          value={values.name}
          onChange={(event) =>
            setValues((v) => ({ ...v, name: event.target.value }))
          }
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="platform">Platform (optional)</Label>
        <Input
          id="platform"
          placeholder="WordPress, Shopify, Laravel..."
          value={values.platform}
          onChange={(event) =>
            setValues((v) => ({ ...v, platform: event.target.value }))
          }
        />
      </div>

      {mode === "edit" && (
        <div className="flex items-center gap-2">
          <input
            id={activeId}
            type="checkbox"
            checked={values.isActive}
            onChange={(event) =>
              setValues((v) => ({ ...v, isActive: event.target.checked }))
            }
            className="size-4 rounded border-input accent-primary"
          />
          <Label htmlFor={activeId} className="font-normal">
            Monitoring active
          </Label>
        </div>
      )}

      {(fieldError ?? apiError) && (
        <p role="alert" className="text-sm text-destructive">
          {fieldError ?? apiError}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? mode === "create"
              ? "Adding..."
              : "Saving..."
            : mode === "create"
              ? "Add website"
              : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
