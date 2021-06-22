const { tools, arweave } = require("../../helpers");

/**
 * Gets the node registry from Redis cache
 * @returns {Array<BundlerPayload<data:RegistrationData>>}
 */
async function getNodes() {
  // Get nodes from cache
  let nodes;
  try {
    nodes = JSON.parse(await tools.redisGetAsync("nodeRegistry"));
    if (nodes === null) nodes = [];
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
  const state = await tools.getContractState();

  // Filter stale nodes from registry
  let nodes = await getNodes();
  console.log(
    `Registry contains ${nodes.length} nodes. Registering ${newNodes.length} more`
  );

  // Verify each registration
  const enc = new TextEncoder();
  // TODO process promises in parallel
  newNodes = newNodes.filter(async (node) => {
    // Filter registrations that don't have an owner or url
    const owner = node.owner;
    if (typeof owner !== "string") return false;
    // Filter addresses with an invalid signature
    const dataBuffer = enc.encode(JSON.stringify(node.data));
    return await arweave.crypto.verify(owner, dataBuffer, node.signature);
  });

  // Filter out duplicate entries
  let latestNodes = {};
  for (const node in nodes.concat(newNodes)) {
    // Filter registrations that don't have an owner or url
    const owner = node.owner;
    if (
      typeof owner !== "string" ||
      node.data === undefined ||
      typeof node.data.url !== "string" ||
      typeof node.data.timestamp !== "number"
    )
      continue;

    // Filter addresses that don't have a stake
    const address = await arweave.wallets.ownerToAddress(owner);
    if (!(address in state.stakes)) continue;

    const latest = latestNodes[owner];
    if (latest === undefined || node.data.timestamp > latest.data.timestamp)
      latestNodes[owner] = node;
  }

  nodes = Object.values(latestNodes);

  // Update registry
  console.log(`Registry now contains ${nodes.length} nodes`);
  await tools.redisSetAsync("nodeRegistry", JSON.stringify(nodes));

  return newNodes.length > 0;
}

module.exports = {
  getNodes,
  registerNodes
};
