"use client";

import { useState, type SubmitEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateAccountSettings } from "../hooks";
import type { SettingsAccount } from "../types";

const MAX_NAME_LENGTH = 100;

interface AccountFormProps {
  account: SettingsAccount;
}

export function AccountForm({ account }: AccountFormProps) {
  // Initialized once from server data, which is already loaded by the time
  // this component mounts (the parent gates on isLoading) -- mirrors
  // WebsiteForm's own "local form state seeded from the initial record"
  // pattern.
  const [name, setName] = useState(account.name);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const { updateAccount, isPending, error: apiError, reset } = useUpdateAccountSettings();

  function handleChange(value: string) {
    setName(value);
    setJustSaved(false);
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setFieldError("Name is required.");
      return;
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      setFieldError(`Name must be at most ${MAX_NAME_LENGTH} characters.`);
      return;
    }
    setFieldError(null);
    reset();

    try {
      await updateAccount({ name: trimmed });
      setName(trimmed);
      setJustSaved(true);
    } catch {
      // apiError (from the mutation hook) already surfaces the server's
      // message -- nothing further to do here.
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-name">Name</Label>
        <Input
          id="account-name"
          value={name}
          onChange={(event) => handleChange(event.target.value)}
          maxLength={MAX_NAME_LENGTH}
          aria-invalid={Boolean(fieldError) || undefined}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-email">Email</Label>
        <Input id="account-email" value={account.email} readOnly disabled />
        {/* Stage 16.8 §9: no email-verification flow exists yet, so email
            stays read-only rather than building an unsafe change flow. */}
        <p className="text-xs text-muted-foreground">
          Email changes are not available yet.
        </p>
      </div>

      {(fieldError ?? apiError) && (
        <p role="alert" className="text-sm text-destructive">
          {fieldError ?? apiError}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        {justSaved && !isPending && (
          <p className="text-sm text-muted-foreground">Saved</p>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
