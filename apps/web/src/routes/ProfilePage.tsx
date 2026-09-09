import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Link } from "@tanstack/react-router";
import { Bell, ChevronRight, LogOut } from "lucide-react";
import { pinSchema } from "@botf/shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { PinInput } from "@/components/ui/PinInput";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useToast } from "@/components/ui/Toast";
import { useChangePin, useLogout, useMe } from "@/hooks/useMe";
import { ApiError } from "@/lib/api";

const changePinSchema = z
  .object({ currentPin: pinSchema, newPin: pinSchema, confirmPin: pinSchema })
  .refine((v) => v.newPin === v.confirmPin, { message: "PINs don't match", path: ["confirmPin"] });
type ChangePinForm = z.infer<typeof changePinSchema>;

function ChangePinCard() {
  const changePin = useChangePin();
  const toast = useToast();
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ChangePinForm>({
    resolver: zodResolver(changePinSchema),
    defaultValues: { currentPin: "", newPin: "", confirmPin: "" },
  });

  async function onSubmit(values: ChangePinForm) {
    try {
      await changePin.mutateAsync({ currentPin: values.currentPin, newPin: values.newPin });
      toast.success("PIN updated");
      reset();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("currentPin", { message: "Current PIN is incorrect" });
      } else {
        toast.error(err instanceof Error ? err.message : "Could not update PIN");
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-ink">Change PIN</h2>
      </CardHeader>
      <CardBody>
        <form className="flex flex-col gap-4" onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
          <Field label="Current PIN" error={errors.currentPin?.message} required>
            <Controller
              control={control}
              name="currentPin"
              render={({ field }) => (
                <PinInput
                  value={field.value}
                  onChange={field.onChange}
                  invalid={Boolean(errors.currentPin)}
                />
              )}
            />
          </Field>
          <Field label="New PIN" error={errors.newPin?.message} required>
            <Controller
              control={control}
              name="newPin"
              render={({ field }) => (
                <PinInput
                  value={field.value}
                  onChange={field.onChange}
                  invalid={Boolean(errors.newPin)}
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
          <div>
            <Button type="submit" loading={changePin.isPending}>
              Update PIN
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function ProfilePage() {
  const { data: me } = useMe();
  const logout = useLogout();

  if (!me) return null;
  const isChild = me.user.role === "child";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Profile" />
      <Card>
        <CardBody className="flex items-center gap-4">
          <Avatar
            name={me.user.displayName}
            color={me.user.avatarColor}
            emoji={me.user.avatarEmoji}
            size="lg"
          />
          <div>
            <p className="text-lg font-semibold text-ink">{me.user.displayName}</p>
            <Badge tone="brand" className="mt-1 capitalize">
              {me.user.role}
            </Badge>
          </div>
        </CardBody>
      </Card>

      <Card>
        <Link
          to="/notifications"
          className="flex items-center gap-3 px-5 py-4 hover:bg-surface rounded-card"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-800">
            <Bell size={18} />
          </div>
          <p className="flex-1 font-medium text-ink">Notifications</p>
          <ChevronRight size={18} className="text-muted" />
        </Link>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-ink">Appearance</h2>
        </CardHeader>
        <CardBody>
          <ThemeToggle />
        </CardBody>
      </Card>

      {isChild && <ChangePinCard />}

      <div>
        <Button
          variant="secondary"
          icon={<LogOut size={16} />}
          loading={logout.isPending}
          onClick={() => logout.mutate()}
        >
          Log out
        </Button>
      </div>
    </div>
  );
}
