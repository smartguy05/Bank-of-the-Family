import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { createChildBody, pinSchema } from "@botf/shared";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { PinInput } from "@/components/ui/PinInput";
import { Button } from "@/components/ui/Button";
import { AvatarPicker } from "@/components/bank/AvatarPicker";
import { AVATAR_COLORS } from "@/lib/avatarOptions";
import { useCreateChild } from "@/hooks/useChildren";
import { useToast } from "@/components/ui/Toast";

const schema = createChildBody
  .extend({ confirmPin: pinSchema })
  .refine((v) => v.pin === v.confirmPin, { message: "PINs don't match", path: ["confirmPin"] });
type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

export function AddChildDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createChild = useCreateChild();
  const toast = useToast();
  const [color, setColor] = useState(AVATAR_COLORS[0]!);
  const [emoji, setEmoji] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: "",
      username: "",
      pin: "",
      confirmPin: "",
      withSavings: true,
      savingsInterestRateBps: 0,
    },
  });

  const withSavings = watch("withSavings");

  async function onSubmit(values: FormOutput) {
    try {
      await createChild.mutateAsync({
        displayName: values.displayName,
        username: values.username,
        pin: values.pin,
        avatarColor: color,
        avatarEmoji: emoji ?? undefined,
        withSavings: values.withSavings,
        savingsInterestRateBps: values.savingsInterestRateBps,
      });
      toast.success(`${values.displayName} was added`);
      reset();
      setColor(AVATAR_COLORS[0]!);
      setEmoji(null);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add child");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add a child" size="lg">
      <form className="flex flex-col gap-4" onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
        <AvatarPicker
          color={color}
          emoji={emoji}
          onChangeColor={setColor}
          onChangeEmoji={setEmoji}
        />
        <Field label="Full name" htmlFor="displayName" error={errors.displayName?.message} required>
          <Input id="displayName" autoFocus {...register("displayName")} />
        </Field>
        <Field label="Username" htmlFor="username" error={errors.username?.message} required>
          <Input id="username" autoComplete="off" {...register("username")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="PIN" error={errors.pin?.message} required>
            <Controller
              control={control}
              name="pin"
              render={({ field }) => (
                <PinInput
                  value={field.value}
                  onChange={field.onChange}
                  invalid={Boolean(errors.pin)}
                  aria-label="PIN"
                />
              )}
            />
          </Field>
          <Field label="Confirm PIN" error={errors.confirmPin?.message} required>
            <Controller
              control={control}
              name="confirmPin"
              render={({ field }) => (
                <PinInput
                  value={field.value}
                  onChange={field.onChange}
                  invalid={Boolean(errors.confirmPin)}
                  aria-label="Confirm PIN"
                />
              )}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-line text-brand-800 focus:ring-accent-500"
            {...register("withSavings")}
          />
          Also open a savings account
        </label>
        {withSavings && (
          <Field
            label="Savings interest rate (APY %)"
            htmlFor="rate"
            error={errors.savingsInterestRateBps?.message}
          >
            <Input
              id="rate"
              type="number"
              step="0.01"
              min={0}
              max={100}
              onChange={(e) =>
                setValue("savingsInterestRateBps", Math.round(Number(e.target.value || 0) * 100))
              }
            />
          </Field>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={createChild.isPending}>
            Add child
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
