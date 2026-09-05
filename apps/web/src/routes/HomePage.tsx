import { useMe } from "@/hooks/useMe";
import { ParentDashboard } from "@/routes/parent/ParentDashboard";
import { ChildHomePage } from "@/routes/child/ChildHomePage";

/** The "/" route renders a different dashboard per role. */
export function HomePage() {
  const { data: me } = useMe();
  if (me?.user.role === "child") return <ChildHomePage />;
  return <ParentDashboard />;
}
