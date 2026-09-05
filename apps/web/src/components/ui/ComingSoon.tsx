import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export function ComingSoon({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <div>
      <PageHeader title={title} />
      <Card>
        <EmptyState icon={icon} title="Coming soon" description={description} />
      </Card>
    </div>
  );
}
