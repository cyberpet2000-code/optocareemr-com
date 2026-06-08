import { cn } from "@/lib/utils";
import { LucideIcon, Inbox } from "lucide-react";

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export default function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  compact,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center gap-2",
        compact ? "py-6 px-3" : "py-12 px-4",
        className
      )}
    >
      <div
        className={cn(
          "empty-state-icon rounded-full flex items-center justify-center",
          compact ? "w-10 h-10" : "w-14 h-14"
        )}
      >
        <Icon className={compact ? "w-5 h-5" : "w-7 h-7"} />
      </div>
      <div className={cn("font-semibold text-foreground", compact ? "text-sm" : "text-base mt-1")}>
        {title}
      </div>
      {description && (
        <p className="text-xs lg:text-sm text-muted-foreground max-w-sm">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
