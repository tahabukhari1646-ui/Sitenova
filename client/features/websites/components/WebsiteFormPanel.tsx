"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Website } from "@/types";
import { WebsiteForm, type WebsiteFormValues } from "./WebsiteForm";

interface WebsiteFormPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  website?: Website;
  isSubmitting: boolean;
  apiError: string | null;
  onSubmit: (values: WebsiteFormValues) => void;
}

export function WebsiteFormPanel({
  open,
  onOpenChange,
  mode,
  website,
  isSubmitting,
  apiError,
  onSubmit,
}: WebsiteFormPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>
            {mode === "create" ? "Add website" : "Edit website"}
          </SheetTitle>
          <SheetDescription>
            {mode === "create"
              ? "Sentinel AI will start tracking this website once added."
              : "Update the details Sentinel AI uses to monitor this website."}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          <WebsiteForm
            key={mode === "edit" ? website?.id : "create"}
            mode={mode}
            initialWebsite={website}
            isSubmitting={isSubmitting}
            apiError={apiError}
            onSubmit={onSubmit}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
