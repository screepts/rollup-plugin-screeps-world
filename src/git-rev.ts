import { readFile, stat } from "fs/promises"
import { resolve, sep } from "path"
import { cwd } from "process"

const RE_BRANCH = /^ref: refs\/heads\/(.*)\n/
const RE_WORKTREE_GITDIR = /^gitdir: (.*)/m

export async function branch(dir?: string) {
  dir ??= cwd()
  const parts = dir.split(sep)

  let gitDir: string | undefined
  while (!gitDir && parts.length) {
    const testPath = resolve(parts.join(sep), ".git")
    await stat(testPath)
      .then(async (s) => {
        if (s.isFile()) {
          const content = await readFile(testPath, "utf8")
          const match = content.match(RE_WORKTREE_GITDIR)
          if (match) gitDir = match[1].trim()
        } else {
          gitDir = testPath
        }
      })
      .catch(() => {})
    parts.pop()
  }
  if (!gitDir) throw new Error("[git-rev] no git repository found")

  const head = await readFile(resolve(gitDir, "HEAD"), "utf8")
  const b = head.match(RE_BRANCH)

  if (b) return b[1]

  throw new Error("[git-rev] detached HEAD, cannot determine branch name")
}
