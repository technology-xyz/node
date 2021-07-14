// Tools singleton
let koiSdk = require("@_koi/sdk/node");
const tools = new koiSdk.Node(process.env.TRUSTED_SERVICE_URL);

// Arweave singleton
const arweave = tools.arweave;

module.exports = {
  tools,
  arweave
};
