import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../src")
const adapters = new Set(["components/ui/squircle.tsx", "components/ui/squircle-effects.ts", "contest/components/kakao-squircle.ts"])

function inspect(source, file) {
  const findings = []
  for (const [index, line] of source.split("\n").entries()) {
    if (/@lisse\//.test(line) && !adapters.has(file)) findings.push(`${file}:${index + 1}: direct Lisse import`)
    if (line.includes("squircle-exception:")) continue
    const utilities = line.match(/\brounded(?:-[\w.[\]%-]+)?/g) ?? []
    const unauthorized = utilities.filter((value) => value !== "rounded-full" && value !== "rounded-none")
    if (unauthorized.length) findings.push(`${file}:${index + 1}: ${unauthorized.join(", ")}`)
    const nativeToken = file === "index.css" && line.includes("var(--squircle-radius)")
    if (/border(?:-[\w]+)*-radius\s*:|border(?:[A-Z]\w*)?Radius\s*:/.test(line) && !adapters.has(file) && !nativeToken) findings.push(`${file}:${index + 1}: direct border radius`)
  }
  return findings
}

async function scan(directory) {
  const findings = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) findings.push(...await scan(path))
    else if (/\.(?:tsx?|jsx?|css)$/.test(entry.name)) findings.push(...inspect(await readFile(path, "utf8"), relative(root, path)))
  }
  return findings
}

const mode = process.argv[2] ?? "--strict"
if (mode === "--self-test") {
  // Given an unapproved page, when scanned, then each prohibited form is found.
  assert.equal(inspect('import { SmoothCorners } from "@lisse/react";\n<div className="rounded-lg" style={{borderRadius: 8}}/>', "page.tsx").length, 3)
  // Given semantic exceptions, when scanned, then their intended geometry remains allowed.
  assert.deepEqual(inspect('<div className="rounded-full rounded-none"/>', "page.tsx"), [])
  assert.equal(inspect("border-top-left-radius: 8px", "page.css").length, 1)
  console.log("Corner checker contracts passed")
} else if (["--strict", "--baseline", "--report"].includes(mode)) {
  const findings = await scan(root)
  console.log(findings.join("\n"))
  console.log(`${findings.length} unauthorized corner usages (${mode.slice(2)})`)
  if (mode === "--strict" && findings.length) process.exitCode = 1
} else {
  console.error("Usage: check-squircle-usage.mjs [--strict|--baseline|--report|--self-test]")
  process.exitCode = 2
}
