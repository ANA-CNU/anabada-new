import { Slot } from "@radix-ui/react-slot"
import { useLayoutEffect, useRef, type ComponentProps, type Ref } from "react"
import { cn } from "@/lib/utils"
import { attachSquircle } from "./squircle-effects"

type Radius = "compact" | "control" | "surface" | "panel" | "hero"
type Corners = "all" | "left" | "right" | "top" | "bottom" | "none"
type SquircleSurfaceProps = Omit<ComponentProps<"div">, "ref"> & {
  readonly asChild?: boolean
  readonly radius?: Radius
  readonly corners?: Corners
  readonly ref?: Ref<HTMLElement>
}

export function SquircleSurface({
  asChild = false,
  radius = "surface",
  corners = "all",
  className,
  ref,
  ...props
}: SquircleSurfaceProps) {
  const elementRef = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element) return
    const native = CSS.supports("corner-shape", "squircle") && !document.documentElement.hasAttribute("data-squircle-fallback")
    element.dataset.squircleMode = native ? "native" : "fallback"
    if (native || corners === "none") return
    const value = Number.parseFloat(getComputedStyle(element).getPropertyValue(`--squircle-radius-${radius}`))
    const corner = { radius: value, curve: "superellipse", exponent: 4 } as const
    const active = (side: "left" | "right", vertical: "top" | "bottom") => corners === "all" || corners === side || corners === vertical
    return attachSquircle(element, {
      topLeft: active("left", "top") ? corner : 0,
      topRight: active("right", "top") ? corner : 0,
      bottomRight: active("right", "bottom") ? corner : 0,
      bottomLeft: active("left", "bottom") ? corner : 0,
    })
  }, [radius, corners])

  const Component = asChild ? Slot : "div"
  return (
    <Component
      {...props}
      className={cn("squircle-surface", className)}
      data-squircle-radius={radius}
      data-squircle-corners={corners}
      ref={(element) => {
        elementRef.current = element
        if (typeof ref === "function") return ref(element)
        if (ref) ref.current = element
      }}
    />
  )
}
