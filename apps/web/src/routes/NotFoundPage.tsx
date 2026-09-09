import { Link } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function NotFoundPage() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-brand-800">
        <Compass size={28} />
      </div>
      <div>
        <h1 className="text-xl font-semibold text-ink">Page not found</h1>
        <p className="mt-1 text-sm text-muted">The page you're looking for doesn't exist.</p>
      </div>
      <Link to="/">
        <Button>Go home</Button>
      </Link>
    </main>
  );
}
