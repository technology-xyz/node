const { tools, arweave } = require("../../helpers");
const { promisify } = require("util");

const redisClient = tools.redisClient;
const redisGetAsync = promisify(redisClient.get).bind(redisClient);

/**
 * Gets the node registry from Redis cache
 * @returns {Array<BundlerPayload<data:RegistrationData>>}
 */
async function getNodes() {
  // Get nodes from cache
  let nodes;
  try {
    nodes = JSON.parse(await redisGetAsync("nodeRegistry"));
  } catch (e) {
    nodes = [];
  }
  return nodes;
}

/**
 * Adds an array of nodes to the local registry
 * @param {Array<NodeRegistration>} newNodes
 * @returns {boolean} Wether some new nodes were added or not
 */
async function registerNodes(newNodes) {
  const state = tools.getContractState();

  // Verify each registration
  const enc = new TextEncoder();
  newNodes = newNodes.filter((node) => {
    const address = arweave.wallets.ownerToAddress(node.owner);
    if (!(address in state.stakes)) return false; // Filter addresses that don't have a stake
    const dataBuffer = enc.encode(JSON.stringify(node.data));
    return arweave.crypto.verify(node.owner, dataBuffer, node.signature);
  });

  // Filter stale nodes from registry
  let nodes = getNodes();
  nodes = nodes.filter((node) => {
    const address = arweave.wallets.ownerToAddress(node.owner);
    return address in state.stakes; // Filter addresses that don't have a stake
  });

  // Filter exact matches from new nodes
  newNodes = newNodes.filter((newNode) => {
    const match = nodes.find(
      (oldNode) => newNode.signature === oldNode.signature
    );
    return match === undefined; // If signature match not found, registration is unique
  });

  // If public modulus or url matches remove it from newNodes
  for (let i = 0; i < nodes.length; ++i) {
    const oldNode = nodes[i];
    const matches = newNodes.filter(
      (newNode) =>
        newNode.owner === oldNode.owner || newNode.data.url === oldNode.data.url
    );
    newNodes = newNodes.filter((newNode) => !(newNode in matches));

    // Use the one with the newest timestamp
    matches.push(oldNode);
    const latest = matches.reduce(function (prev, current) {
      return prev.data.timestamp > current.data.timestamp ? prev : current;
    });
    nodes[i] = latest;
  }

  // Remaining nodes in newNodes are unique, merge lists
  nodes = nodes.concat(newNodes);

  // Update registry
  await this.redisGetAsync("nodeRegistry", JSON.stringify(nodes));

  return newNodes.length > 0;
}

module.exports = {
  getNodes,
  registerNodes
};
