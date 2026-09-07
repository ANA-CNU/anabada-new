import { SquircleSurface } from "./squircle"
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <SquircleSurface asChild radius="compact"><div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse", className)}
      {...props}
    /></SquircleSurface>
  )
}

export { Skeleton }
