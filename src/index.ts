import { ScreepsAPI, type CodeList } from "screeps-api"
import * as git from "./git-rev"
import { readFile } from "fs/promises"
import type { Plugin, OutputOptions, OutputBundle, PluginContext } from "rollup"

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
  /** The branch to use, or "auto" to determine the branch from the current git repository */
  branch: string
}

export interface ScreepsOptions {
  configFile?: string
  config?: ScreepsConfig
  server?: string
  branch?: string
  dryRun?: boolean
  spawn?: SpawnConfig | ((api: ScreepsAPI) => Promise<SpawnConfig | false>)
}

/** Replace all source maps with js modules that export the map as a string */
function generateBundle(this: PluginContext, options: OutputOptions, bundle: OutputBundle) {
  if (!options.sourcemap) return
  for (const itemName in bundle) {
    const item = bundle[itemName]
    if (item.type === "chunk" && item.map && item.sourcemapFileName) {
      this.emitFile({
        type: "asset",
        fileName: item.sourcemapFileName + ".js",
        source: `module.exports = ${item.map.toString()};`,
      })
      delete bundle[item.sourcemapFileName]
    }
  }
}

function validateConfig(cfg: Partial<ScreepsConfig>): cfg is ScreepsConfig {
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

async function loadConfigFile(configFile: string) {
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
  const server = opts.server || SCREEPS_SERVER || ""
  const branch = opts.branch || SCREEPS_BRANCH
  return ScreepsAPI.fromConfig(server, "rollup", branch ? { branch } : {})
}

async function uploadSource(api: ScreepsAPI, bundle: OutputBundle) {
  const branch = await getBranchName(api.opts.branch)
  await api.code.set(branch, getFileList(bundle))
  return branch
}

function getFileList(bundle: OutputBundle) {
  const code: CodeList = {}

  for (const itemName in bundle) {
    const item = bundle[itemName]
    const name = item.fileName.slice(0, item.fileName.lastIndexOf("."))
    code[name] =
      item.type === "chunk"
        ? item.code
        : typeof item.source === "string"
          ? item.source
          : { binary: Buffer.from(item.source).toString("base64") }
  }

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

export function screeps(screepsOptions: ScreepsOptions = {}): Plugin {
  return {
    name: "screeps",

    generateBundle,

    async writeBundle(_options, bundle) {
      if (screepsOptions.dryRun) return this.warn("Dry run enabled, skipping upload")

      const api = await loadApi(screepsOptions)

      const branch = await uploadSource(api, bundle)
      this.info(`✔ Successfully uploaded to ${branch}`)

      await spawn.call(this, api, screepsOptions)
    },
  }
}

export default screeps
