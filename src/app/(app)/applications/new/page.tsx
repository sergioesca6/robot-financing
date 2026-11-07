"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ApplicationWizard } from "@/components/applications/application-wizard";

function NewApplication() {
  const params = useSearchParams();
  return <ApplicationWizard initialCustomerId={params.get("customer") ?? undefined} />;
}

export default function NewApplicationPage() {
  return (
    <Suspense fallback={null}>
      <NewApplication />
    </Suspense>
  );
}
