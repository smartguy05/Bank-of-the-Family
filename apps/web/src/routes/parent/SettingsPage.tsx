import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import dayjs from "dayjs";
import { Link } from "@tanstack/react-router";
import { Bell, ChevronRight, Copy, Plus, Trash2 } from "lucide-react";
import { updateFamilyBody } from "@botf/shared";
import type { UpdateFamilyBody } from "@botf/shared";
import { z } from "zod";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { CURRENCIES } from "@/lib/locales";
import { useFamily, useFamilyParents, useUpdateFamily } from "@/hooks/useFamily";
import { useCreateInvite, useDeleteInvite, useInvites } from "@/hooks/useInvites";

const timezones = (() => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
})();

const inviteSchema = z.object({
  inviteeName: z.string().max(80).optional(),
  inviteeEmail: z.string().email().max(200).optional().or(z.literal("")),
});
type InviteForm = z.infer<typeof inviteSchema>;

function FamilyForm() {
  const { data: family, isLoading } = useFamily();
  const updateFamily = useUpdateFamily();
  const toast = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateFamilyBody>({
    resolver: zodResolver(updateFamilyBody),
    values: family
      ? {
          name: family.name,
          currencyCode: family.currencyCode,
          locale: family.locale,
          timezone: family.timezone,
          allowOverdraft: family.allowOverdraft,
        }
      : undefined,
  });

  if (isLoading || !family) return <Skeleton className="h-64 w-full" />;

  async function onSubmit(values: UpdateFamilyBody) {
    try {
      await updateFamily.mutateAsync(values);
      toast.success("Family settings saved");
      reset(values);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings");
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-ink">Family</h2>
      </CardHeader>
      <CardBody>
        <form className="flex flex-col gap-4" onSubmit={(e) => void handleSubmit(onSubmit)(e)}>
          <Field label="Family name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" {...register("name")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency" htmlFor="currencyCode">
              <Select id="currencyCode" {...register("currencyCode")}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Locale" htmlFor="locale">
              <Input id="locale" {...register("locale")} />
            </Field>
          </div>
          <Field label="Timezone" htmlFor="timezone">
            <Select id="timezone" {...register("timezone")}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-line text-brand-800 focus:ring-accent-500"
              {...register("allowOverdraft")}
            />
            Allow accounts to go negative (overdraft)
          </label>
          <div>
            <Button type="submit" loading={updateFamily.isPending} disabled={!isDirty}>
              Save changes
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function ParentsList() {
  const { data: parents, isLoading } = useFamilyParents();
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-ink">Co-parents</h2>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        {parents?.length ? (
          parents.map((p) => (
            <div key={p.id} className="flex items-center gap-3">
              <Avatar name={p.displayName} color={p.avatarColor} emoji={p.avatarEmoji} size="sm" />
              <span className="text-sm text-ink">{p.displayName}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted">Just you so far.</p>
        )}
      </CardBody>
    </Card>
  );
}

function InvitesSection() {
  const { data: invites, isLoading } = useInvites();
  const createInvite = useCreateInvite();
  const deleteInvite = useDeleteInvite();
  const toast = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { register, handleSubmit, reset } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { inviteeName: "", inviteeEmail: "" },
  });

  async function onSubmit(values: InviteForm) {
    try {
      await createInvite.mutateAsync({
        inviteeName: values.inviteeName || undefined,
        inviteeEmail: values.inviteeEmail || undefined,
      });
      toast.success("Invite created");
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create invite");
    }
  }

  async function copyLink(id: string, code: string) {
    const link = `${window.location.origin}/invite/${code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.info(link);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-ink">Invite a co-parent</h2>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
        >
          <Field label="Name (optional)" htmlFor="inviteeName" className="flex-1">
            <Input id="inviteeName" {...register("inviteeName")} />
          </Field>
          <Field label="Email (optional)" htmlFor="inviteeEmail" className="flex-1">
            <Input id="inviteeEmail" type="email" {...register("inviteeEmail")} />
          </Field>
          <Button type="submit" icon={<Plus size={16} />} loading={createInvite.isPending}>
            Create invite
          </Button>
        </form>

        <div className="divide-y divide-line">
          {isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : !invites || invites.length === 0 ? (
            <EmptyState title="No invites yet" />
          ) : (
            invites.map((invite) => (
              <div key={invite.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {invite.inviteeName ?? invite.inviteeEmail ?? "Invite link"}
                  </p>
                  <p className="text-xs text-muted">
                    Expires {dayjs(invite.expiresAt).format("MMM D, YYYY")}
                    {invite.acceptedAt && " · Accepted"}
                  </p>
                </div>
                {!invite.acceptedAt && (
                  <Badge tone={dayjs(invite.expiresAt).isBefore(dayjs()) ? "negative" : "brand"}>
                    {dayjs(invite.expiresAt).isBefore(dayjs()) ? "Expired" : "Pending"}
                  </Badge>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Copy size={14} />}
                  onClick={() => void copyLink(invite.id, invite.code)}
                >
                  {copiedId === invite.id ? "Copied!" : "Copy link"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={14} />}
                  onClick={() => void deleteInvite.mutateAsync(invite.id)}
                  aria-label="Revoke invite"
                />
              </div>
            ))
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function NotificationsShortcut() {
  return (
    <Card>
      <Link
        to="/notifications"
        className="flex items-center gap-3 px-5 py-4 hover:bg-surface rounded-card"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-800">
          <Bell size={18} />
        </div>
        <div className="flex-1">
          <p className="font-medium text-ink">Notifications</p>
          <p className="text-sm text-muted">Manage alerts and push notifications</p>
        </div>
        <ChevronRight size={18} className="text-muted" />
      </Link>
    </Card>
  );
}

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" subtitle="Family preferences and access" />
      <FamilyForm />
      <ParentsList />
      <InvitesSection />
      <NotificationsShortcut />
    </div>
  );
}
