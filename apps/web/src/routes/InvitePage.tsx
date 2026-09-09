import { useEffect } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import dayjs from "dayjs";
import { Landmark, MailWarning } from "lucide-react";
import { registerViaInviteBody } from "@botf/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useMe } from "@/hooks/useMe";
import { useAcceptInvite, useInvitePreview, useRegisterViaInvite } from "@/hooks/useInvites";

const registerSchema = registerViaInviteBody
  .extend({ confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
type RegisterForm = z.infer<typeof registerSchema>;

export function InvitePage() {
  const { code } = useParams({ from: "/invite/$code" });
  const navigate = useNavigate();
  const toast = useToast();
  const { data: me, isLoading: meLoading } = useMe();
  const { data: preview, isLoading, isError } = useInvitePreview(code);
  const accept = useAcceptInvite();
  const register = useRegisterViaInvite(code);

  const {
    register: formRegister,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: "", name: "", email: "", password: "", confirmPassword: "" },
  });

  useEffect(() => {
    if (preview?.inviteeName) reset((prev) => ({ ...prev, name: preview.inviteeName ?? "" }));
  }, [preview?.inviteeName, reset]);

  if (isLoading || meLoading) {
    return (
      <main className="flex min-h-full items-center justify-center bg-surface p-4">
        <Card className="w-full max-w-md p-6">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-6 h-11 w-full" />
        </Card>
      </main>
    );
  }

  if (isError || !preview || !preview.valid) {
    return (
      <main className="flex min-h-full items-center justify-center bg-surface p-4">
        <Card className="w-full max-w-md">
          <EmptyState
            icon={<MailWarning size={28} />}
            title="This invite link isn't valid"
            description="It may have expired or already been used. Ask your family admin to send a new one."
          />
        </Card>
      </main>
    );
  }

  async function handleAccept() {
    try {
      await accept.mutateAsync(code);
      toast.success(`Welcome to ${preview!.familyName}`);
      await navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not accept invite");
    }
  }

  async function onRegister(values: RegisterForm) {
    try {
      const res = await register.mutateAsync(values);
      window.location.assign(res.loginUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create account");
    }
  }

  const alreadyInFamily = me?.user.role === "parent" && Boolean(me.family);
  const isChild = me?.user.role === "child";

  return (
    <main className="flex min-h-full items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-900 text-white shadow-md">
            <Landmark size={28} />
          </div>
          <h1 className="text-2xl font-semibold text-ink">Join {preview.familyName}</h1>
          <p className="text-sm text-muted">
            {preview.invitedByName} invited you
            {preview.inviteeName ? ` (${preview.inviteeName})` : ""} to co-manage the family bank.
            Expires {dayjs(preview.expiresAt).format("MMM D, YYYY")}.
          </p>
        </div>

        <Card className="p-5">
          {isChild ? (
            <EmptyState
              title="Signed in as a kid"
              description="Ask a parent to sign in and accept this invite."
            />
          ) : alreadyInFamily ? (
            <EmptyState
              title="You're already part of a family"
              description="Each parent can belong to only one family."
            />
          ) : me ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted">
                Signed in as <strong>{me.user.displayName}</strong>.
              </p>
              <Button
                size="lg"
                fullWidth
                loading={accept.isPending}
                onClick={() => void handleAccept()}
              >
                Join {preview.familyName}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div>
                <p className="mb-2 text-sm text-muted">Already have an Authentik account?</p>
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  onClick={() => window.location.assign(`/api/auth/oidc/login?invite=${code}`)}
                >
                  Sign in with Authentik
                </Button>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted">
                <div className="h-px flex-1 bg-line" />
                or
                <div className="h-px flex-1 bg-line" />
              </div>

              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => void handleSubmit(onRegister)(e)}
              >
                <p className="text-sm font-medium text-ink">Create my account</p>
                <Field label="Full name" htmlFor="name" error={errors.name?.message} required>
                  <Input id="name" {...formRegister("name")} />
                </Field>
                <Field
                  label="Username"
                  htmlFor="username"
                  error={errors.username?.message}
                  required
                >
                  <Input id="username" autoComplete="username" {...formRegister("username")} />
                </Field>
                <Field label="Email (optional)" htmlFor="email" error={errors.email?.message}>
                  <Input id="email" type="email" autoComplete="email" {...formRegister("email")} />
                </Field>
                <Field
                  label="Password"
                  htmlFor="password"
                  error={errors.password?.message}
                  required
                >
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    {...formRegister("password")}
                  />
                </Field>
                <Field
                  label="Confirm password"
                  htmlFor="confirmPassword"
                  error={errors.confirmPassword?.message}
                  required
                >
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    {...formRegister("confirmPassword")}
                  />
                </Field>
                <Button type="submit" size="lg" fullWidth loading={register.isPending}>
                  Create account
                </Button>
              </form>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
