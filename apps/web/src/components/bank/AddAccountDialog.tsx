import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { createAccountBody } from "@botf/shared";
import type { CreateAccountBody } from "@botf/shared";

type FormInput = z.input<typeof createAccountBody>;
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useCreateAccount } from "@/hooks/useAccounts";
import { useToast } from "@/components/ui/Toast";

export function AddAccountDialog({
  open,
  onClose,
  ownerUserId,
}: {
  open: boolean;
  onClose: () => void;
  ownerUserId: string;
}) {
  const createAccount = useCreateAccount();
  const toast = useToast();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormInput, unknown, CreateAccountBody>({
    resolver: zodResolver(createAccountBody),
    defaultValues: { ownerUserId, type: "savings", name: "", interestRateBps: 0 },
  });

  const type = watch("type");

  async function onSubmit(values: CreateAccountBody) {
    try {
      await createAccount.mutateAsync({ ...values, ownerUserId });
      toast.success("Account created");
      reset();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create account");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add account">
      <form className="flex flex-col gap-4" onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
        <Field label="Type" htmlFor="type">
          <Select id="type" {...register("type")}>
            <option value="checking">Checking</option>
            <option value="savings">Savings</option>
          </Select>
        </Field>
        <Field label="Name (optional)" htmlFor="name" error={errors.name?.message}>
          <Input
            id="name"
            placeholder={type === "savings" ? "Savings" : "Checking"}
            {...register("name")}
          />
        </Field>
        {type === "savings" && (
          <Field
            label="Interest rate (APY %)"
            htmlFor="rate"
            error={errors.interestRateBps?.message}
          >
            <Input
              id="rate"
              type="number"
              step="0.01"
              min={0}
              max={100}
              {...register("interestRateBps", {
                setValueAs: (v: string) => Math.round(Number(v || 0) * 100),
              })}
            />
          </Field>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={createAccount.isPending}>
            Create account
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
