"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch inline-flex shrink-0 items-center rounded-full border border-transparent p-px shadow-xs transition-[background-color,border-color,box-shadow,opacity] outline-none data-disabled:cursor-not-allowed data-disabled:opacity-40 data-[size=default]:h-5 data-[size=default]:w-8 data-[size=default]:[--travel:12px] data-[size=sm]:h-4 data-[size=sm]:w-6 data-[size=sm]:[--travel:8px] data-checked:bg-primary data-unchecked:bg-foreground/30",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "relative block bg-transparent ring-0 transition-transform duration-200 before:absolute before:inset-y-0 before:left-0 before:w-[calc(50%+2px)] before:rounded-l-full before:bg-white before:content-[''] before:transition-transform before:duration-200 after:absolute after:inset-y-0 after:right-0 after:w-[calc(50%+2px)] after:rounded-r-full after:bg-white after:content-[''] after:transition-transform after:duration-200 dark:before:bg-foreground dark:after:bg-foreground dark:group-data-checked/switch:before:bg-primary-foreground dark:group-data-checked/switch:after:bg-primary-foreground group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 group-data-checked/switch:translate-x-(--travel) rtl:group-data-checked/switch:-translate-x-(--travel) ltr:group-data-unchecked/switch:group-[:not([data-disabled])]/switch:group-hover/switch:after:translate-x-0.5 ltr:group-data-checked/switch:group-[:not([data-disabled])]/switch:group-hover/switch:before:-translate-x-0.5 rtl:group-data-unchecked/switch:group-[:not([data-disabled])]/switch:group-hover/switch:before:-translate-x-0.5 rtl:group-data-checked/switch:group-[:not([data-disabled])]/switch:group-hover/switch:after:translate-x-0.5"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
