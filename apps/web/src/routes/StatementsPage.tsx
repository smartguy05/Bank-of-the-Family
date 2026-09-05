import { FileText } from "lucide-react";
import { ComingSoon } from "@/components/ui/ComingSoon";

export function StatementsPage() {
  return (
    <ComingSoon
      title="Statements"
      icon={<FileText size={28} />}
      description="Monthly statements for each account will be available to view and download here."
    />
  );
}
