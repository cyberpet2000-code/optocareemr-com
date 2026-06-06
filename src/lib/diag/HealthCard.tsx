import StatusBadge from "./StatusBadge";

export default function HealthCard({
  title,
  severity,
  description,
}: {
  title: string;
  severity: "healthy" | "warn" | "error" | "critical";
  description: string;
}) {
  return (
    <div className="rounded-xl border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">
          {title}
        </h3>

        <StatusBadge variant={severity}>
          {severity}
        </StatusBadge>
      </div>

      <p className="text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
