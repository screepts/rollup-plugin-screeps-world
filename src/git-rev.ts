import { readFile, stat } from "fs/promises"
import { resolve, sep } from "path"
import { cwd } from "process"

const RE_BRANCH = /^ref: refs\/heads\/(.*)\n/
const RE_GITDIR = /^gitdir: (.*)\n/

async function findGitDir(dir?: string) {
  dir ??= cwd()
  const parts = dir.split(sep)

  while (parts.length) {
    const testPath = resolve(parts.join(sep), ".git")
    parts.pop()

    const s = await stat(testPath).catch(() => undefined)
    if (!s) continue

    if (!s.isFile()) return testPath

    const content = await readFile(testPath, "utf8")
    const match = content.match(RE_GITDIR)

    if (match) return match[1]
  }
}

export async function branch(dir?: string) {
  const gitDir = await findGitDir(dir)
  if (!gitDir) throw new Error("[git-rev] no git repository found")

  const head = await readFile(resolve(gitDir, "HEAD"), "utf8")
  const b = head.match(RE_BRANCH)

  if (b) return b[1]

  throw new Error("[git-rev] detached HEAD, cannot determine branch name")
}
