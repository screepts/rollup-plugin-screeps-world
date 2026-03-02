import { access, readFile } from "fs/promises"
import { resolve, sep } from "path"
import { cwd } from "process"

const RE_BRANCH = /^ref: refs\/heads\/(.*)\n/

export async function branch(dir?: string) {
  dir ??= cwd()
  const parts = dir.split(sep)

  let gitDir: string | undefined
  while (!gitDir && parts.length) {
    const testPath = resolve(parts.join(sep), ".git")
    access(testPath)
      .then(() => (gitDir = testPath))
      .catch(() => {})
  }
  if (!gitDir) throw new Error("[git-rev] no git repository found")

  const head = await readFile(resolve(gitDir, "HEAD"), "utf8")
  const b = head.match(RE_BRANCH)

  if (b) return b[1]

  throw new Error("[git-rev] detached HEAD, cannot determine branch name")
}
