import { SquircleSurface } from "./squircle"
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import type { VariantProps } from "class-variance-authority"
import { buttonVariants } from "./button-variants"

import { cn } from "@/lib/utils"

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <SquircleSurface asChild radius="control"><Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    /></SquircleSurface>
  )
}

export { Button }
