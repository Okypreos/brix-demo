"use client";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Shown for the brief window where Clerk says signed-in but the
// `user.created` webhook hasn't mirrored the row into Convex yet.
// `useCurrentUser` is reactive, so this unmounts itself once the
// webhook lands (usually <1s).
export function SyncingAccountCard() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>Setting up your account</CardTitle>
          <CardDescription>
            Just syncing your profile. This will only take a moment.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
