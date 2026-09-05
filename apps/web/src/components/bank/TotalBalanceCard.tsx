import { Users } from "lucide-react";
import { Money } from "@/components/ui/Money";

export function TotalBalanceCard({
  totalMinor,
  childCount,
}: {
  totalMinor: number;
  childCount: number;
}) {
  return (
    <div className="rounded-card bg-gradient-to-br from-brand-900 to-brand-700 p-6 text-white shadow-md">
      <div className="flex items-center gap-2 text-brand-100">
        <Users size={16} />
        <p className="text-sm">Total kids&rsquo; balances</p>
      </div>
      <p className="mt-2 text-4xl font-semibold tabular">
        <Money minor={totalMinor} />
      </p>
      <p className="mt-1 text-sm text-brand-100">
        Across {childCount} {childCount === 1 ? "child" : "children"}
      </p>
    </div>
  );
}
