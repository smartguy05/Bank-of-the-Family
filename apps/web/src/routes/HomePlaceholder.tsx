import { formatMoney } from "@botf/shared";

export function HomePlaceholder() {
  return (
    <main className="min-h-full flex items-center justify-center p-6">
      <div className="bg-card rounded-card shadow-sm border border-line p-8 max-w-md w-full">
        <p className="text-muted text-sm uppercase tracking-wide">Bank of the Family</p>
        <h1 className="text-2xl font-semibold text-brand-900 mt-1">Scaffold ready</h1>
        <p className="mt-4 text-muted">
          Shared money formatting works: <span className="tabular">{formatMoney(1250, "USD")}</span>
        </p>
      </div>
    </main>
  );
}
