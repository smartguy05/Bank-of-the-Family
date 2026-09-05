import { useState } from "react";
import { Plus, Users } from "lucide-react";
import type { ChildSummary } from "@botf/shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ChildCard } from "@/components/bank/ChildCard";
import { AddChildDialog } from "@/components/bank/AddChildDialog";
import { useChildren } from "@/hooks/useChildren";

export function ChildrenPage() {
  const { data, isLoading } = useChildren();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="Kids"
        subtitle="Manage your children's profiles and accounts"
        actions={
          <Button size="sm" icon={<Plus size={16} />} onClick={() => setAddOpen(true)}>
            Add child
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<Users size={28} />}
          title="No kids yet"
          description="Add your first child to open their accounts and start managing allowance."
          action={<Button onClick={() => setAddOpen(true)}>Add a child</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.map((c: ChildSummary) => (
            <ChildCard key={c.user.id} child={c} />
          ))}
        </div>
      )}

      <AddChildDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
