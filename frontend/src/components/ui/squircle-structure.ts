type StructureGuard = {
  references: number
  readonly schedules: Set<() => void>
  readonly refresh: () => void
  readonly destroy: () => void
}

const guards = new WeakMap<HTMLElement, StructureGuard>()

export function acquireSquircleStructure(anchor: HTMLElement, schedule: () => void) {
  let guard = guards.get(anchor)
  if (!guard) {
    let terminal: Element | null = null
    const schedules = new Set<() => void>()
    const children = new Set<Element>()
    // 형제의 크기 변경은 대상 크기를 유지한 채 위치만 옮길 수 있어 부모별로 함께 갱신한다.
    const resizeObserver = new ResizeObserver(() => {
      for (const callback of schedules) callback()
    })
    const refresh = () => {
      const current = new Set([...anchor.children].filter((child) => !child.hasAttribute("data-squircle-effect")))
      for (const child of children) {
        if (current.has(child)) continue
        resizeObserver.unobserve(child)
        children.delete(child)
      }
      for (const child of current) {
        if (children.has(child)) continue
        resizeObserver.observe(child, { box: "border-box" })
        children.add(child)
      }
      const spaced = [...anchor.classList].some((token) => /(^|:)space-y-/.test(token))
      let next = spaced ? anchor.lastElementChild : null
      while (next?.hasAttribute("data-squircle-effect")) next = next.previousElementSibling
      if (terminal !== next) {
        terminal?.removeAttribute("data-squircle-space-terminal")
        next?.setAttribute("data-squircle-space-terminal", "")
        terminal = next
      }
      anchor.toggleAttribute("data-squircle-space-parent", spaced)
    }
    const observer = new MutationObserver(refresh)
    observer.observe(anchor, { childList: true, attributes: true, attributeFilter: ["class"] })
    guard = {
      references: 0,
      schedules,
      refresh,
      destroy: () => {
        observer.disconnect()
        resizeObserver.disconnect()
        children.clear()
        schedules.clear()
        terminal?.removeAttribute("data-squircle-space-terminal")
        anchor.removeAttribute("data-squircle-space-parent")
        guards.delete(anchor)
      },
    }
    guards.set(anchor, guard)
  }
  const retained = guard
  retained.references++
  // 같은 스케줄 함수로 여러 번 획득해도 해제 수명은 각 획득에 귀속된다.
  const callback = () => schedule()
  retained.schedules.add(callback)
  retained.refresh()
  let released = false
  return () => {
    if (released) return
    released = true
    retained.schedules.delete(callback)
    retained.references--
    if (retained.references === 0) retained.destroy()
  }
}
