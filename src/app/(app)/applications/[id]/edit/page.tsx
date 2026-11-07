"use client";

import { useParams } from "next/navigation";
import { ApplicationWizard } from "@/components/applications/application-wizard";

export default function EditApplicationPage() {
  const { id } = useParams<{ id: string }>();
  return <ApplicationWizard key={id} applicationId={id} />;
}
