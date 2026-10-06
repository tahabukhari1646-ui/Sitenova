"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageContainer } from "@/components/layout/PageContainer";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingState } from "@/components/shared/LoadingState";
import { AccountForm } from "@/features/settings/components/AccountForm";
import { AppearanceSettings } from "@/features/settings/components/AppearanceSettings";
import { NotificationPreferences } from "@/features/settings/components/NotificationPreferences";
import { useSettings } from "@/features/settings/hooks";

export default function SettingsPage() {
  const { settings, isLoading, isError, error, refetch } = useSettings();

  return (
    <PageContainer
      title="Settings"
      description="Manage your account and preferences."
    >
      {isLoading ? (
        <LoadingState label="Loading your settings..." />
      ) : isError || !settings ? (
        <ErrorState
          title="Unable to load settings"
          description={error ?? undefined}
          action={
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      ) : (
        <div className="flex max-w-2xl flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>
                Update your basic account information.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AccountForm account={settings.account} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>
                Choose how Sentinel AI notifies you.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NotificationPreferences notifications={settings.notifications} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Customize how Sentinel AI looks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AppearanceSettings />
            </CardContent>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
