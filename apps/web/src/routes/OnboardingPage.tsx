import { useNavigate } from "@tanstack/react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Landmark } from "lucide-react";
import { createFamilyBody } from "@botf/shared";
import type { CreateFamilyBody } from "@botf/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useCreateFamily } from "@/hooks/useFamily";
import { useToast } from "@/components/ui/Toast";
import { CURRENCIES } from "@/lib/locales";
import { browserTimezone, timezones } from "@/lib/timezones";

type FormInput = z.input<typeof createFamilyBody>;

const browserLocale = navigator.language || "en-US";

const LOCALES = [
  "en-US",
  "en-GB",
  "en-AU",
  "en-CA",
  "en-NZ",
  "fr-FR",
  "de-DE",
  "es-ES",
  "es-MX",
  "pt-BR",
  "it-IT",
  "nl-NL",
  "sv-SE",
  "ja-JP",
  "hi-IN",
];

export function OnboardingPage() {
  const navigate = useNavigate();
  const createFamily = useCreateFamily();
  const toast = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInput, unknown, CreateFamilyBody>({
    resolver: zodResolver(createFamilyBody),
    defaultValues: {
      name: "",
      currencyCode: "USD",
      locale: LOCALES.includes(browserLocale) ? browserLocale : "en-US",
      timezone: browserTimezone,
    },
  });

  async function onSubmit(values: CreateFamilyBody) {
    try {
      await createFamily.mutateAsync(values);
      await navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create family");
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-900 text-white shadow-md">
            <Landmark size={28} />
          </div>
          <h1 className="text-2xl font-semibold text-brand-900">Set up your family</h1>
          <p className="text-sm text-muted">
            This creates your family&rsquo;s bank. You can invite the other parent and add kids
            next.
          </p>
        </div>

        <Card className="p-5">
          <form className="flex flex-col gap-4" onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
            <Field label="Family name" htmlFor="name" error={errors.name?.message} required>
              <Input id="name" placeholder="The Smith Family" autoFocus {...register("name")} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Currency" htmlFor="currencyCode" error={errors.currencyCode?.message}>
                <Select id="currencyCode" {...register("currencyCode")}>
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Locale" htmlFor="locale" error={errors.locale?.message}>
                <Select id="locale" {...register("locale")}>
                  {LOCALES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Timezone" htmlFor="timezone" error={errors.timezone?.message}>
              <Select id="timezone" {...register("timezone")}>
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" size="lg" fullWidth loading={createFamily.isPending}>
              Create family
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
