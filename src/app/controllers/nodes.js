const StatusCodes = require("../config/status_codes");
const { getNodes, registerNodes } = require("../helpers/nodes");

/**
 * Responds with the node registry from Redis cache
 * @param {*} _req express.js request
 * @param {*} res express.js result object
 */
async function nodes(_req, res) {
  try {
    const nodes = await getNodes();
    res.status(200).send(nodes);
  } catch (e) {
    console.error(e);
    res.status(500).send({ error: "ERROR: " + e });
  }
}

/**
 * Registers a node in the redis cache
 * @param {*} req express.js request
 * @param {*} res express.js result object
 */
async function registerNode(req, res) {
  try {
    const regRes = await registerNodes([req.body]);
    if (regRes) res.status(200).end();
    else
      res.status(StatusCodes.RESPONSE_CONFLICT).json({
        message: "Registration is duplicate, outdated, or invalid"
      });
  } catch (e) {
    console.error(e);
    res.status(500).send({ error: "ERROR: " + e });
  }
}

module.exports = { nodes, registerNode };
