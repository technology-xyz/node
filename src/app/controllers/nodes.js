const StatusCodes = require("../config/status_codes");
const { getNodes, registerNodes } = require("../helpers/nodes");

/**
 * Responds with the node registry from Redis cache
 * @param {*} _req express.js request
 * @param {*} res express.js result object
 */
async function nodes(_req, res) {
  const nodes = await getNodes();
  res.status(200).send(nodes);
}

/**
 * Registers a node in the redis cache
 * @param {*} req express.js request
 * @param {*} res express.js result object
 */
async function registerNode(req, res) {
  const registration = req.body;
  if (!registration.data.url) registration.data.url = `http://${req.ip}:8887`;
  const regRes = registerNodes([registration]);

  return regRes
    ? res.status(200)
    : res.status(StatusCodes.RESPONSE_ACTION_FAILED).json({
        message: "Registration is duplicate, outdated, or invalid"
      });
}

module.exports = { nodes, registerNode };
