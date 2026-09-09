import type { ComponentProps } from "react"
import { Slot, Slottable } from "@radix-ui/react-slot"
import { SquircleSurface } from "./squircle"
import { cn } from "@/lib/utils"

export function SidebarAction({ asChild, className, children, ...props }: ComponentProps<"button"> & { readonly asChild?: boolean }) {
  const Component = asChild ? Slot : "button"
  return (
    <Component {...props} className={cn("group/sidebar-action isolate", className)}>
      <SquircleSurface asChild radius="compact">
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 ring-sidebar-ring group-hover/sidebar-action:bg-sidebar-accent group-focus-visible/sidebar-action:ring-2" />
      </SquircleSurface>
      <Slottable>{children}</Slottable>
    </Component>
  )
}
