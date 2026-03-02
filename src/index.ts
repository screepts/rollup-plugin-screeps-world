import { ScreepsAPI } from "screeps-api"
import * as git from "./git-rev"
import { readdir, readFile, rename } from "fs/promises"
import type { Plugin, OutputOptions, OutputBundle, PluginContext } from "rollup"
import { dirname, extname, join } from "path"

const SCREEPS_SERVER = process?.env.SCREEPS_SERVER
const SCREEPS_BRANCH = process?.env.SCREEPS_BRANCH

type SpawnPosConfig =
  | {
      x: number
      y: number
      name?: string
      auto?: never
    }
  | {
      auto: true
    }
export type SpawnConfig = {
  roomName: string
  respawn?: boolean
} & SpawnPosConfig

export interface ScreepsConfig {
  token?: string
  email?: string
  password?: string
  protocol: "http" | "https"
  hostname: string
  port: number
  path: string
  branch: string | "auto"
}

export interface ScreepsOptions {
  configFile?: string
  config?: ScreepsConfig
  server?: string
  branch?: string
  dryRun?: boolean
  spawn?: SpawnConfig | ((api: ScreepsAPI) => Promise<SpawnConfig | false>)
}

export interface BinaryModule {
  binary: string
}

export interface CodeList {
  [key: string]: string | BinaryModule
}

export function generateSourceMaps(bundle: OutputBundle) {
  // Iterate through bundle and test if type===chunk && map is defined
  let itemName: string
  for (itemName in bundle) {
    const item = bundle[itemName]
    if (item.type === "chunk" && item.map) {
      // Tweak maps
      const tmp = item.map.toString

      delete item.map.sourcesContent

      item.map.toString = function () {
        return "module.exports = " + tmp.apply(this, arguments as unknown as []) + ";"
      }
    }
  }
}

export function writeSourceMaps(options: OutputOptions) {
  return rename(options.file + ".map", options.file + ".map.js")
}

export function validateConfig(cfg: Partial<ScreepsConfig>): cfg is ScreepsConfig {
  if (cfg.hostname && cfg.hostname === "screeps.com") {
    return [
      typeof cfg.token === "string",
      cfg.protocol === "http" || cfg.protocol === "https",
      typeof cfg.hostname === "string",
      typeof cfg.port === "number",
      typeof cfg.path === "string",
      typeof cfg.branch === "string",
    ].reduce((a, b) => a && b)
  }

  return [
    (typeof cfg.email === "string" && typeof cfg.password === "string") ||
      typeof cfg.token === "string",
    cfg.protocol === "http" || cfg.protocol === "https",
    typeof cfg.hostname === "string",
    typeof cfg.port === "number",
    typeof cfg.path === "string",
    typeof cfg.branch === "string",
  ].reduce((a, b) => a && b)
}

export async function loadConfigFile(configFile: string) {
  const data = await readFile(configFile, "utf8")
  const cfg = JSON.parse(data) as Partial<ScreepsConfig>
  if (cfg.email && cfg.password && !cfg.token && cfg.hostname === "screeps.com") {
    console.log("Please change your email/password to a token")
  }
  return cfg
}

export async function loadApi(opts: ScreepsOptions) {
  if (opts.config || opts.configFile) {
    const config = opts.config || (await loadConfigFile(opts.configFile!))
    if (!validateConfig(config)) throw new TypeError("Invalid config")
    const api = new ScreepsAPI(config)
    if (!config.token) await api.auth(config.email!, config.password!)
    return api
  }
  const server = opts.server || SCREEPS_SERVER
  const branch = opts.branch || SCREEPS_BRANCH
  return ScreepsAPI.fromConfig(server, "rollup", branch ? { branch } : {})
}

export async function uploadSource(api: ScreepsAPI, options: OutputOptions) {
  const code = await getFileList(options.file!)
  const branch = await getBranchName(api.opts.branch)
  return runUpload(api, branch, code)
}

export function runUpload(api: ScreepsAPI, branch: string, code: CodeList) {
  api.raw.user.branches().then((data: any) => {
    const branches = data.list.map((b: any) => b.branch)

    if (branches.includes(branch)) {
      api.code.set(branch, code)
    } else {
      api.raw.user.cloneBranch("", branch, code)
    }
  })
}

const EXTS = [".js", ".wasm", ".cjs", ".mjs"]
export async function getFileList(outputFile: string) {
  const code: CodeList = {}
  const base = dirname(outputFile)

  const promises = (await readdir(base))
    .map((file) => ({ file, ext: extname(file) }))
    .filter(({ ext }) => EXTS.includes(ext))
    .map(async ({ file, ext }) => {
      const data = await readFile(join(base, file))
      const name = file.slice(0, file.length - ext.length)
      code[name] = ext.endsWith("js") ? data.toString("utf8") : { binary: data.toString("base64") }
    })

  await Promise.all(promises)
  return code
}

export function getBranchName(branch: string | undefined) {
  if (branch && branch !== "auto") return Promise.resolve(branch)
  return git.branch()
}

export async function spawn(this: PluginContext, api: ScreepsAPI, screepsOptions: ScreepsOptions) {
  const spawnConfig: SpawnConfig | false =
    typeof screepsOptions.spawn === "function"
      ? await screepsOptions.spawn(api)
      : Object.assign({}, screepsOptions.spawn, api.appConfig.spawn, api.opts.spawn)
  if (!spawnConfig || !spawnConfig.roomName) return

  if (!spawnConfig.auto && (spawnConfig.x === undefined || spawnConfig.y === undefined))
    return this.error("Invalid spawn config, missing coordinates")

  const { status } = await api.raw.user.worldStatus()
  if (status !== "empty") {
    if (status !== "lost" && spawnConfig.respawn !== true)
      return this.info("Game is not lost, skipping respawn")

    this.info("Respawning...")
    await api.raw.user.respawn()
  }

  const pos = await findSpawnPos(api, spawnConfig)
  if (!pos) return this.error("Failed to find spawn position")

  await api.raw.game.placeSpawn(spawnConfig.roomName, pos.x, pos.y, pos.name)
  this.info(`Spawn placed at ${pos.x},${pos.y} in ${spawnConfig.roomName}`)
}

async function findSpawnPos(api: ScreepsAPI, spawnConfig: SpawnPosConfig & { roomName: string }) {
  if (!spawnConfig.auto) return { name: "Spawn1", ...spawnConfig }

  const terrainRes = await api.raw.game.roomTerrain(spawnConfig.roomName)
  if (!terrainRes.ok || terrainRes.terrain.length !== 1 || !("terrain" in terrainRes.terrain[0]))
    return null

  const terrain = terrainRes.terrain[0].terrain

  const UNBUILDABLE_BORDER = 2
  for (let y = UNBUILDABLE_BORDER; y < 50 - UNBUILDABLE_BORDER; y++) {
    for (let x = UNBUILDABLE_BORDER; x < 50 - UNBUILDABLE_BORDER; x++) {
      const idx = y * 50 + x
      if (terrain[idx] === "0") return { name: "auto", x, y }
    }
  }
  return null
}

export function screeps(screepsOptions: ScreepsOptions = {}) {
  return {
    name: "screeps",

    generateBundle(options, bundle, _isWrite) {
      if (options.sourcemap) generateSourceMaps(bundle)
    },

    async writeBundle(options, _bundle) {
      if (options.sourcemap) await writeSourceMaps(options)

      if (screepsOptions.dryRun) return this.warn("Dry run enabled, skipping upload")

      const hasServer =
        SCREEPS_SERVER ||
        screepsOptions.server ||
        screepsOptions.config ||
        screepsOptions.configFile
      if (!hasServer) return this.error("No config provided, skipping upload")

      const api = await loadApi(screepsOptions)
      await uploadSource(api, options)
      await spawn.call(this, api, screepsOptions)
    },
  } as Plugin
}

export default screeps
