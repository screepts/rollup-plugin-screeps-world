import rollup, { type ModuleFormat } from "rollup"
import typescript from "rollup-plugin-typescript2"
import { describe, expect, it } from "vitest"
import path from "path"
import fs from "fs"
import screeps, { getBranchName, loadApi } from ".."
import json from "./fixtures/screeps.json"
import { ScreepsAPI } from "screeps-api"

describe("Rollup Screeps Plugin", function () {
  it("should support tokens for screeps.com", async () => {
    const config: any = Object.assign({}, json)
    expect(await loadApi({ config })).to.be.instanceOf(ScreepsAPI)
  })

  it("should reject email/password for screeps.com", async () => {
    const config: any = Object.assign({}, json, { email: "you@domain.tld", password: "foo" })
    delete config.token
    await expect(loadApi({ config })).rejects.toThrow("Invalid config")
  })

  it("should generate source maps", async function () {
    const options = {
      input: "./tests/fixtures/main.ts",
      output: {
        file: "./tests/dist/main.js",
        sourcemap: true,
        format: "cjs" as ModuleFormat,
      },
      plugins: [typescript({ tsconfig: "./tests/tsconfig.json" }), screeps({ dryRun: true })],
    }

    const build = await rollup.rollup(options as rollup.InputOptions)
    const { output: bundle } = await build.write(options.output as rollup.OutputOptions)

    // Iterate through bundle and test if type===chunk && map is defined
    for (const item of bundle) {
      if (item.type === "chunk" && item.map) {
        expect(item.map.toString()).to.match(/^module.exports/)
      }
    }
    const basePath = path.join(__dirname, "dist")
    const originalPath = path.join(basePath, "main.js.map")
    const newPath = path.join(basePath, "main.js.map.js")

    expect(fs.existsSync(originalPath)).to.equal(false)
    expect(fs.existsSync(newPath)).to.equal(true)
  })

  it("should generate branch name", async function () {
    expect(await getBranchName("auto")).to.be.a("string")
  })

  it("should use the branch name", async function () {
    expect(getBranchName("ai")).to.equal("ai")
  })
})
