import {
  acquirePosition,
  createDropShadow,
  createSvgEffects,
  generateClipPath,
  generatePath,
  getLayoutSize,
  observeResize,
  parseBorder,
  parseBoxShadow,
  releasePosition,
  type SmoothCornerOptions,
} from "@lisse/core"
import { acquireSquircleStructure } from "./squircle-structure"

let nextShadowId = 0

export function attachSquircle(element: HTMLElement, options: SmoothCornerOptions) {
  const disposers: (() => void)[] = []
  const cleanup = () => {
    for (const dispose of disposers.splice(0).reverse()) dispose()
  }
  try {
    attachEffects(element, options, disposers)
    return cleanup
  } catch (error) {
    cleanup()
    throw error
  }
}

function attachEffects(element: HTMLElement, options: SmoothCornerOptions, disposers: (() => void)[]) {
  const parent = element.parentElement
  if (!parent) return () => {}
  const anchor = parent
  const positioned = acquirePosition(anchor)
  if (positioned) disposers.push(() => releasePosition(anchor))
  const border = createSvgEffects(anchor, element)
  disposers.push(() => border.destroy())
  const borderLayer = anchor.lastElementChild
  borderLayer?.setAttribute("data-squircle-effect", "")
  const shadow = createDropShadow(anchor, element)
  disposers.push(() => shadow.destroy())
  const shadowLayer = anchor.lastElementChild
  shadowLayer?.setAttribute("data-squircle-effect", "")
  const mask = document.createElementNS("http://www.w3.org/2000/svg", "mask")
  const maskId = `squircle-shadow-${++nextShadowId}`
  mask.id = maskId
  mask.setAttribute("maskUnits", "userSpaceOnUse")
  mask.setAttribute("x", "-10000")
  mask.setAttribute("y", "-10000")
  mask.setAttribute("width", "20000")
  mask.setAttribute("height", "20000")
  const maskBackground = document.createElementNS("http://www.w3.org/2000/svg", "rect")
  for (const attribute of ["x", "y", "width", "height"]) maskBackground.setAttribute(attribute, mask.getAttribute(attribute) ?? "0")
  maskBackground.setAttribute("fill", "white")
  const maskShape = document.createElementNS("http://www.w3.org/2000/svg", "path")
  maskShape.setAttribute("fill", "black")
  mask.append(maskBackground, maskShape)
  shadowLayer?.querySelector("defs")?.append(mask)
  const shadowGroup = document.createElementNS("http://www.w3.org/2000/svg", "g")
  shadowGroup.setAttribute("mask", `url(#${maskId})`)
  shadowLayer?.append(shadowGroup)
  const originalClip = element.style.clipPath
  const originalRadius = element.style.borderRadius
  let originalBorder = element.style.borderColor
  let originalShadow = element.style.boxShadow
  let frame = 0
  disposers.push(() => {
    cancelAnimationFrame(frame)
    element.style.clipPath = originalClip
    element.style.borderRadius = originalRadius
    element.style.borderColor = originalBorder
    element.style.boxShadow = originalShadow
  })

  const observer = new MutationObserver(() => {
    if (element.style.borderColor !== "transparent") originalBorder = element.style.borderColor
    if (element.style.boxShadow !== "none") originalShadow = element.style.boxShadow
    schedule()
  })
  const observe = () => observer.observe(element, { attributes: true, attributeFilter: ["class", "style", "data-state", "aria-invalid", "disabled"] })
  disposers.push(() => observer.disconnect())

  function cancelTransferredPaintTransitions() {
    for (const animation of element.getAnimations()) {
      if (typeof CSSTransition !== "undefined" && animation instanceof CSSTransition && ["border-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "box-shadow"].includes(animation.transitionProperty)) animation.cancel()
    }
  }

  function update() {
    observer.disconnect()
    element.style.borderColor = originalBorder
    element.style.boxShadow = originalShadow
    cancelTransferredPaintTransitions()
    const css = getComputedStyle(element)
    const { width, height } = getLayoutSize(element, css)
    const uniformBorder = [css.borderRightWidth, css.borderBottomWidth, css.borderLeftWidth].every((width) => width === css.borderTopWidth)
    const innerBorder = uniformBorder ? parseBorder(element, css) : undefined
    const effects = parseBoxShadow(css.boxShadow)
    const outlineWidth = Number.parseFloat(css.outlineWidth)
    const outline = css.outlineStyle !== "none" && outlineWidth > 0
      ? [{ offsetX: 0, offsetY: 0, blur: 0, spread: outlineWidth + Number.parseFloat(css.outlineOffset), color: css.outlineColor, opacity: 1 }]
      : []
    const offset = { x: element.offsetLeft, y: element.offsetTop }
    element.style.borderColor = uniformBorder ? "transparent" : originalBorder
    element.style.boxShadow = "none"
    element.style.borderRadius = "0"
    element.style.clipPath = generateClipPath(width, height, options)
    maskShape.setAttribute("d", generatePath(width, height, options))
    cancelTransferredPaintTransitions()
    border.update(options, {
      innerBorder,
      innerShadow: effects.innerShadow,
    }, width, height, offset)
    shadow.update(options, [...outline, ...(effects.shadow ?? [])], width, height, offset)
    for (const path of shadowLayer?.querySelectorAll(":scope > path") ?? []) shadowGroup.append(path)
    for (const layer of [borderLayer, shadowLayer]) {
      if (!(layer instanceof SVGElement)) continue
      layer.style.transform = css.transform
      layer.style.transformOrigin = css.transformOrigin
      layer.style.translate = css.translate
      layer.style.scale = css.scale
      layer.style.rotate = css.rotate
      layer.style.opacity = css.opacity
      if (css.position === "fixed") {
        layer.style.position = "fixed"
        layer.style.left = css.left
        layer.style.top = css.top
      }
      if (css.zIndex !== "auto") layer.style.zIndex = css.zIndex
    }
    if (shadowLayer && css.zIndex !== "auto") anchor.insertBefore(shadowLayer, element)
    observe()
    if (element.getAnimations().some((animation) => animation.playState === "running")) schedule()
  }

  function schedule() {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(update)
  }

  disposers.push(acquireSquircleStructure(anchor, schedule))
  const events = ["focusin", "focusout", "pointerenter", "pointerleave", "pointerdown", "pointerup", "transitionrun", "transitionend", "animationstart", "animationend"] as const
  for (const event of events) element.addEventListener(event, schedule)
  disposers.push(() => {
    for (const event of events) element.removeEventListener(event, schedule)
  })
  disposers.push(observeResize(element, update))
  disposers.push(observeResize(anchor, schedule))
  update()
}
