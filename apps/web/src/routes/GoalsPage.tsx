import { Target } from "lucide-react";
import { ComingSoon } from "@/components/ui/ComingSoon";

export function GoalsPage() {
  return (
    <ComingSoon
      title="Goals"
      icon={<Target size={28} />}
      description="Set savings goals and watch progress toward the things you're saving for."
    />
  );
}
