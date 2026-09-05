import { BellRing } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { usePush } from "@/hooks/usePush";

export function PushCard() {
  const { state, loading, subscribe, unsubscribe } = usePush();
  const toast = useToast();

  async function handleEnable() {
    try {
      await subscribe();
      toast.success("Push notifications turned on for this device");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not enable push notifications");
    }
  }

  async function handleDisable() {
    try {
      await unsubscribe();
      toast.info("Push notifications turned off for this device");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disable push notifications");
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-800">
          <BellRing size={18} />
        </div>
        <h2 className="font-semibold text-ink">Push notifications</h2>
      </CardHeader>
      <CardBody className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-sm text-sm text-muted">
          Get notified on this device for deposits, allowance, and requests — even when the app is
          closed.
        </p>
        {state === "unsupported" && <Badge tone="neutral">Not supported here</Badge>}
        {state === "denied" && <Badge tone="warning">Blocked in browser settings</Badge>}
        {state === "prompt" && (
          <Button size="sm" loading={loading} onClick={() => void handleEnable()}>
            Enable
          </Button>
        )}
        {state === "subscribed" && (
          <div className="flex items-center gap-2">
            <Badge tone="positive">Enabled ✓</Badge>
            <Button
              size="sm"
              variant="secondary"
              loading={loading}
              onClick={() => void handleDisable()}
            >
              Disable
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
