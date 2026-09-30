// SPDX-License-Identifier: GPL-2.0-or-later
import { runAgent } from "../../game-agent/mission.mjs";
import { connect, describe } from "./player.js";
const app = {
  command: "classicube", connect, describe, tools: ["game_input"],
  extension: "/usr/src/dolly/classicube/agent/player.js", instructions: "/usr/src/dolly/classicube/agent/PLAYER.md",
  idlePrompt: "Explore the world and have fun.",
  agentEnvironment: scratch => ({DOLLY_CLASSICUBE_DIR:scratch}),
  gameEnvironment: scratch => ({DOLLY_CLASSICUBE_DIR:scratch,SDL_VIDEODRIVER:"dummy"}),
};
export const runPlayer = options => runAgent({...options,app});
