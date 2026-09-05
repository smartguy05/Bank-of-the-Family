import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { pinSchema } from "@botf/shared";
import type { ChildSummary } from "@botf/shared";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { PinInput } from "@/components/ui/PinInput";
import { Button } from "@/components/ui/Button";
import { useResetPin } from "@/hooks/useChildren";
import { useToast } from "@/components/ui/Toast";

const schema = z
  .object({ pin: pinSchema, confirmPin: pinSchema })
  .refine((v) => v.pin === v.confirmPin, { message: "PINs don't match", path: ["confirmPin"] });
type FormValues = z.infer<typeof schema>;

export function ResetPinDialog({
  child,
  onClose,
}: {
  child: ChildSummary | null;
  onClose: () => void;
}) {
  const resetPin = useResetPin(child?.user.id ?? "");
  const toast = useToast();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { pin: "", confirmPin: "" },
  });

  if (!child) return null;

  async function onSubmit(values: FormValues) {
    try {
      await resetPin.mutateAsync(values.pin);
      toast.success(`PIN reset for ${child!.user.displayName}`);
      reset();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset PIN");
    }
  }

  return (
    <Dialog
      open={Boolean(child)}
      onClose={onClose}
      title={`Reset PIN for ${child.user.displayName}`}
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
        <Field label="New PIN" error={errors.pin?.message} required>
          <Controller
            control={control}
            name="pin"
            render={({ field }) => (
              <PinInput
                value={field.value}
                onChange={field.onChange}
                invalid={Boolean(errors.pin)}
                autoFocus
              />
            )}
          />
        </Field>
        <Field label="Confirm new PIN" error={errors.confirmPin?.message} required>
          <Controller
            control={control}
            name="confirmPin"
            render={({ field }) => (
              <PinInput
                value={field.value}
                onChange={field.onChange}
                invalid={Boolean(errors.confirmPin)}
              />
            )}
          />
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={resetPin.isPending}>
            Reset PIN
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
