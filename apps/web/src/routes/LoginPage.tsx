import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Landmark, Lock, ShieldCheck } from "lucide-react";
import { usernameSchema, pinSchema } from "@botf/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { PinInput } from "@/components/ui/PinInput";
import { ApiError } from "@/lib/api";
import { useChildLogin, useDevLogin } from "@/hooks/useMe";
import { useToast } from "@/components/ui/Toast";

const childLoginSchema = z.object({ username: usernameSchema, pin: pinSchema });
type ChildLoginForm = z.infer<typeof childLoginSchema>;

export function LoginPage() {
  const [panel, setPanel] = useState<"parent" | "kid">("kid");
  const search = useSearch({ from: "/login" });
  const navigate = useNavigate();
  const childLogin = useChildLogin();
  const devLogin = useDevLogin();
  const toast = useToast();
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);

  async function handleDevLogin() {
    try {
      await devLogin.mutateAsync({ authentikSub: "dev:demo-parent", displayName: "Demo Parent" });
      await navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Developer sign-in failed");
    }
  }

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors },
  } = useForm<ChildLoginForm>({
    resolver: zodResolver(childLoginSchema),
    defaultValues: { username: "", pin: "" },
  });

  const pin = watch("pin");

  async function onSubmit(values: ChildLoginForm) {
    setLockedMessage(null);
    try {
      await childLogin.mutateAsync(values);
      await navigate({ to: "/" });
    } catch (err) {
      if (err instanceof ApiError && err.code === "PIN_LOCKED") {
        setLockedMessage(err.message);
      } else if (err instanceof ApiError && err.status === 401) {
        setError("pin", { message: "Incorrect username or PIN" });
      } else {
        setError("pin", { message: err instanceof Error ? err.message : "Sign-in failed" });
      }
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-900 text-white shadow-md">
            <Landmark size={28} />
          </div>
          <h1 className="text-2xl font-semibold text-brand-900">Bank of the Family</h1>
          <p className="text-sm text-muted">Secure banking for the whole family</p>
        </div>

        <Card className="p-1.5">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface p-1">
            <button
              type="button"
              onClick={() => setPanel("parent")}
              className={`rounded-md py-2 text-sm font-medium transition-colors ${
                panel === "parent" ? "bg-card text-brand-900 shadow-sm" : "text-muted"
              }`}
            >
              Parent
            </button>
            <button
              type="button"
              onClick={() => setPanel("kid")}
              className={`rounded-md py-2 text-sm font-medium transition-colors ${
                panel === "kid" ? "bg-card text-brand-900 shadow-sm" : "text-muted"
              }`}
            >
              Kid
            </button>
          </div>

          <div className="p-5">
            {search.error === "not_a_parent" && (
              <p className="mb-4 rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">
                That account isn&rsquo;t set up as a parent. Please sign in from the Kid tab, or
                contact your family&rsquo;s admin.
              </p>
            )}

            {panel === "parent" ? (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted">
                  Parents sign in with your family&rsquo;s identity provider (Authentik).
                </p>
                <Button
                  size="lg"
                  fullWidth
                  onClick={() => window.location.assign("/api/auth/oidc/login")}
                >
                  Sign in with Authentik
                </Button>
              </div>
            ) : (
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => void handleSubmit(onSubmit)(e)}
              >
                <Field
                  label="Username"
                  htmlFor="username"
                  error={errors.username?.message}
                  required
                >
                  <Input
                    id="username"
                    autoComplete="username"
                    autoFocus
                    invalid={Boolean(errors.username)}
                    {...register("username")}
                  />
                </Field>
                <Field
                  label="PIN"
                  error={errors.pin?.message ?? lockedMessage ?? undefined}
                  required
                >
                  <PinInput
                    value={pin}
                    onChange={(v) => setValue("pin", v, { shouldValidate: true })}
                    invalid={Boolean(errors.pin) || Boolean(lockedMessage)}
                    aria-label="PIN"
                  />
                </Field>
                <Button type="submit" size="lg" fullWidth loading={childLogin.isPending}>
                  Sign in
                </Button>
              </form>
            )}
          </div>
        </Card>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted">
          <ShieldCheck size={14} />
          <span>Your session is protected and never shared outside your family.</span>
        </div>
        <div className="mt-1 flex items-center justify-center gap-1.5 text-xs text-muted">
          <Lock size={14} />
          <span>256-bit encrypted connection</span>
        </div>

        {import.meta.env.DEV && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => void handleDevLogin()}
              disabled={devLogin.isPending}
              className="text-xs text-muted underline underline-offset-2 hover:text-ink disabled:opacity-50"
            >
              Developer sign-in
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
