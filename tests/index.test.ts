import rollup, { ModuleFormat } from "rollup"
import typescript from "rollup-plugin-typescript2"
import { describe, expect, it } from "vitest"
import path from "path"
import fs from "fs"
import screeps, { getBranchName, getFileList, loadConfigFile, validateConfig } from ".."

describe("Rollup Screeps Plugin", function () {
  it("should support tokens for screeps.com and email/password for any other server", () => {
    let config: any = {
      token: "foo",
      branch: "auto",
      protocol: "https",
      hostname: "screeps.com",
      port: 443,
      path: "/",
    }

    expect(validateConfig(config)).to.equal(true)

    config = {
      email: "you@domain.tld",
      password: "foo",
      branch: "auto",
      protocol: "https",
      hostname: "screeps.com",
      port: 443,
      path: "/",
    }

    expect(validateConfig(config)).to.equal(false)

    config = {
      token: "foo",
      branch: "auto",
      protocol: "https",
      hostname: "myscreeps.com",
      port: 443,
      path: "/",
    }

    expect(validateConfig(config)).to.equal(true)

    config = {
      email: "you@domain.tld",
      password: "foo",
      branch: "auto",
      protocol: "https",
      hostname: "myscreeps.com",
      port: 443,
      path: "/",
    }

    expect(validateConfig(config)).to.equal(true)
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

    const bundle = await rollup.rollup(options)
    await bundle.write(options.output)

    // Iterate through bundle and test if type===chunk && map is defined
    let itemName
    for (itemName in bundle) {
      let item = bundle[itemName]
      if (item.type === "chunk" && item.map) {
        expect(item.map.toString()).to.match(/^module.exports/)
      }
    }
    var basePath = path.join(__dirname, "dist")
    var originalPath = path.join(basePath, "main.js.map")
    var newPath = path.join(basePath, "main.js.map.js")

    expect(fs.existsSync(originalPath)).to.equal(false)
    expect(fs.existsSync(newPath)).to.equal(true)
  })

  it("should generate branch name", async function () {
    expect(await getBranchName("auto")).to.be.a("string")
  })

  it("should use the branch name", async function () {
    expect(getBranchName("ai")).to.equal("ai")
  })

  it("should create a list of files to upload", async function () {
    var screepsOptions = {
      dryRun: true,
    }

    var options = {
      input: "./tests/fixtures/main.ts",
      output: {
        file: "./tests/dist/main.js",
        sourcemap: true,
        format: "cjs" as ModuleFormat,
      },
      plugins: [typescript({ tsconfig: "./tests/tsconfig.json" }), screeps(screepsOptions)],
    }

    let bundle = await rollup.rollup(options)
    await bundle.write(options.output)

    const code: any = getFileList(options.output.file)

    expect(Object.keys(code).length).to.equal(3)
    expect(code.main).to.match(/input/)
    expect(code["main.js.map"]).to.match(/^module.exports/)
  })

  it("should upload WASM files as binary modules", async function () {
    var screepsOptions = {
      dryRun: true,
    }

    var options = {
      input: "./tests/fixtures/main.ts",
      output: {
        file: "./tests/dist/main.js",
        sourcemap: true,
        format: "cjs" as ModuleFormat,
      },
      plugins: [typescript({ tsconfig: "./tests/tsconfig.json" }), screeps(screepsOptions)],
    }

    let bundle = await rollup.rollup(options)
    await bundle.write(options.output)

    const code: any = getFileList(options.output.file)

    expect(code["wasm_module.wasm"]).to.be.an("object")
    expect(code["wasm_module.wasm"].binary).to.be.a("string")
    expect(code.main).to.be.a("string")
  })

  it("should get the config", async function () {
    var config = await loadConfigFile("./tests/fixtures/screeps.json")
    expect(config.branch).to.equal("foo")
  })
})
