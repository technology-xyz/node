const tools = require("../../tools");
const { promisify } = require("util");

const redisClient = tools.redisClient;
const redisSetAsync = promisify(redisClient.set).bind(redisClient);
const redisGetAsync = promisify(redisClient.get).bind(redisClient);

/**
 *
 * @param {*} req
 * @param {*} res
 */
async function getCurrentState(req, res) {
  try {
    let currentState = await tools.getContractState();
    console.log("RECEIVED CURRENT STATE", currentState);
    if (currentState) {
      res.status(200).send(currentState);
      if (redisSetAsync) {
        await redisSetAsync(
          "currentState",
          JSON.stringify(currentState),
          "EX",
          5 * 60
        );
      }
    } else {
      res.status(500).send({ error: "state not available" });
    }
  } catch (e) {
    console.log(e);
    res.status(500).send({ error: "ERROR: " + e });
  }
}

/**
 * Responds with a cache of the projected future state
 *   including all pending updates, from all nodes
 * @param {*} req express.js request
 * @param {*} res express.js result object
 */
// async function getProjectedState(req, res) {
//   console.log("current state", cache.state);
//   await updateStateCache();
//   if (cache.state) {
//     res.status(200).send(cache.state);
//   } else res.status(500).send({ error: "state not available" });
// }

/** TODO
 * Responds with a cache of pending states
 * @param {*} req express.js request
 * @param {*} res express.js result object
 */
// async function getPendingState(req, res) {
//   console.log("current state");
// }

/**
 *
 * @param {*} req express.js request
 * @param {*} res express.js result object
 */
async function getCurrentStateCached(req, res) {
  try {
    let currentStateCached = await redisGetAsync("currentStateCached");
    res.status(200).send(currentStateCached || []);
  } catch (e) {
    console.log(e);
    res.status(500).send({ error: "ERROR: " + e });
  }
}

module.exports = { getCurrentState, getCurrentStateCached };
