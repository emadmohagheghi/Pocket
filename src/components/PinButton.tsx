import { Pin, PinOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function PinButton({
  pinned,
  onToggle,
  className,
  label,
}: {
  pinned: boolean;
  onToggle: () => void;
  className?: string;
  label?: string;
}) {
  const accessibleLabel = label ?? (pinned ? "Unpin" : "Pin");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={accessibleLabel}
          aria-pressed={pinned}
          className={cn(
            "text-muted-foreground hover:text-foreground",
            pinned && "text-foreground",
            className
          )}
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
        >
          {pinned ? <PinOff /> : <Pin />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{accessibleLabel}</TooltipContent>
    </Tooltip>
  );
}
