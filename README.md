# Rollup Screeps World Plugin

A Rollup plugin to upload your code to Screeps MMO or private server. It supports both the new unified credentials file and the old json config file.

Also works with `rolldown` and `vite`.

## Install

```
npm install --save-dev rollup-plugin-screeps-world
```

## Usage

In `rollup.config.js`

```js
import screeps from "rollup-plugin-screeps-world"

export default {
  // ...
  plugins: [
    // ...
    screeps(),
  ],
}
```

### Yaml Config File

rollup-plugin-screeps-world now uses the [Screeps Unified Credentials File](https://github.com/screepers/screepers-standards/blob/master/SS3-Unified_Credentials_File.md), as used by [screeps-api](https://github.com/screepers/node-screeps-api).

Example `.screeps.yaml` config file:

```
servers:
  main:
    host: screeps.com
    secure: true
    token: '00000000-0a0a-0a00-000a-a0000a0000a0'
  private:
    host: 127.0.0.1
    port: 21025
    secure: false
    username: bob
    password: password123
```

Target server default to `main`, it can be selected with `screeps({ server: 'my-server' })` or the environment variable `$SCREEPS_SERVER`.

Branch _(aka the destination folder on screeps server)_ default to `auto`, it can be select with `screeps({ branch: 'my-branch' })` or the environment variable `$SCREEPS_BRANCH`.

### JS Config File

rollup-plugin-screeps-world still support the json config file.

```json
{
  "email": "you@domain.tld",
  "password": "pass",
  "protocol": "https",
  "hostname": "screeps.com",
  "port": 443,
  "path": "/",
  "branch": "auto"
}
```

It change be loaded from a file with `screeps({ configFile: './screeps.json' })` or direct as value with `screeps({ config: my_config })`.

If `branch` is set to `"auto"` rollup-plugin-screeps-world will use your current git branch as the name of the branch on screeps, if you set it to anything else that string will be used as the name of the branch.

### Automatic Spawn building

The plugin can also automatically spawn your bot after upload. To enable this feature, set the `spawn` option either in `rollup.config.js` or config file. It should be either:

- an object with `roomName`, `x` and `y` properties to specify the spawn location
- an object with `roomName` property and `auto` set to `true` to use "auto spawn" feature of [screepsmod-admin-utils](https://github.com/ScreepsMods/screepsmod-admin-utils)
- an async function that takes the [API client](https://github.com/screepers/node-screeps-api) and returns one of the objects above, allowing you to implement custom spawn logic

In `rollup.config.js`

```js
import screeps from "rollup-plugin-screeps-world"

export default {
  plugins: [
    screeps({
      spawn: async (api) => {
        // custom spawn logic here
        return { roomName, x, y }
      },
    }),
  ],
}
```
