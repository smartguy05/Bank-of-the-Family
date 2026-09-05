import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { updateChildBody } from "@botf/shared";
import type { ChildSummary, UpdateChildBody } from "@botf/shared";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AvatarPicker } from "@/components/bank/AvatarPicker";
import { AVATAR_COLORS } from "@/lib/avatarOptions";
import { useUpdateChild } from "@/hooks/useChildren";
import { useToast } from "@/components/ui/Toast";

export function EditChildDialog({
  child,
  onClose,
}: {
  child: ChildSummary | null;
  onClose: () => void;
}) {
  const updateChild = useUpdateChild(child?.user.id ?? "");
  const toast = useToast();
  const [color, setColor] = useState(child?.user.avatarColor ?? AVATAR_COLORS[0]!);
  const [emoji, setEmoji] = useState<string | null>(child?.user.avatarEmoji ?? null);
  const [syncedChildId, setSyncedChildId] = useState(child?.user.id);

  // Re-seed the avatar picker from render when a different child is opened,
  // rather than in an effect (avoids an extra render-then-setState cascade).
  if (child && child.user.id !== syncedChildId) {
    setSyncedChildId(child.user.id);
    setColor(child.user.avatarColor);
    setEmoji(child.user.avatarEmoji);
  }

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateChildBody>({
    resolver: zodResolver(updateChildBody),
    values: child
      ? {
          displayName: child.user.displayName,
          username: child.user.username ?? undefined,
          isActive: child.user.isActive,
        }
      : undefined,
  });

  if (!child) return null;

  async function onSubmit(values: UpdateChildBody) {
    try {
      await updateChild.mutateAsync({ ...values, avatarColor: color, avatarEmoji: emoji });
      toast.success("Saved");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save changes");
    }
  }

  return (
    <Dialog open={Boolean(child)} onClose={onClose} title={`Edit ${child.user.displayName}`}>
      <form className="flex flex-col gap-4" onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
        <AvatarPicker
          color={color}
          emoji={emoji}
          onChangeColor={setColor}
          onChangeEmoji={setEmoji}
        />
        <Field label="Full name" htmlFor="displayName" error={errors.displayName?.message} required>
          <Input id="displayName" {...register("displayName")} />
        </Field>
        <Field label="Username" htmlFor="username" error={errors.username?.message} required>
          <Input id="username" {...register("username")} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-line text-brand-800 focus:ring-accent-500"
            {...register("isActive")}
          />
          Account active
        </label>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={updateChild.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
