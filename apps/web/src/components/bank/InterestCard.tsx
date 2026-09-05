import { useState } from "react";
import { PiggyBank } from "lucide-react";
import type { Account } from "@botf/shared";
import { monthlyInterestMinor } from "@botf/shared";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { useToast } from "@/components/ui/Toast";
import { useUpdateAccount } from "@/hooks/useAccounts";

/** Percentage-rate editor for a savings account's annual interest, paid monthly. */
export function InterestCard({ account }: { account: Account }) {
  const [rate, setRate] = useState(() => (account.interestRateBps / 100).toFixed(2));
  const updateAccount = useUpdateAccount(account.id);
  const toast = useToast();

  const parsedBps = Math.round((Number(rate) || 0) * 100);
  const dirty = parsedBps !== account.interestRateBps;
  const projected = monthlyInterestMinor(account.balanceMinor, parsedBps);

  async function handleSave() {
    if (parsedBps < 0 || parsedBps > 10000 || Number.isNaN(parsedBps)) {
      toast.error("Enter a rate between 0% and 100%");
      return;
    }
    try {
      await updateAccount.mutateAsync({ interestRateBps: parsedBps });
      toast.success("Interest rate updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update interest rate");
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-100 text-accent-600">
          <PiggyBank size={18} />
        </div>
        <div>
          <h2 className="font-semibold text-ink">Interest — {account.name}</h2>
          <p className="text-xs text-muted">Paid monthly on the 1st</p>
        </div>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Annual rate (APY %)" htmlFor={`rate-${account.id}`} className="w-32">
            <Input
              id={`rate-${account.id}`}
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </Field>
          <Button
            size="sm"
            disabled={!dirty}
            loading={updateAccount.isPending}
            onClick={() => void handleSave()}
          >
            Save
          </Button>
        </div>
        <p className="text-sm text-muted">
          At the current balance, that's about{" "}
          <span className="font-medium text-ink">
            <Money minor={projected} />
          </span>{" "}
          next month.
        </p>
      </CardBody>
    </Card>
  );
}
