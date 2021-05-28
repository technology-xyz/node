const tools = require("../../tools");
const axios = require("axios");
const Arweave = require("arweave");
const arweave = Arweave.init({
  host: "arweave.dev",
  protocol: "https",
  port: 443,
  timeout: 20000, // Network request timeouts in milliseconds
  logging: false // Enable network request logging
});

/**
 * Interact with koi sdk to call contract batchAction to store/pass the votes in/to state
 * @param {string} fileName Transaction id of stored votes on arweave
 * @returns
 */
async function submitVote(fileName) {
  let response = await batchUpdateContractState(fileName);
  return await tools.batchAction(response.id);
}

/**
 * Koi contract vote
 * @param {*} voteId receives an integer vote ID corresponding to an active
 * @returns
 */
async function batchUpdateContractState(voteId) {
  const proposal = {
    bundlerId: 10,
    voteId: voteId
  };

  const data = await getData(proposal);
  return await bundleAndExport(data);
}

/**
 *
 * @param {*} proposal
 * @returns
 */
async function getData(proposal) {
  const res = axios.post("https://bundler.openkoi.com/getVotes/", proposal);
  return res.data;
}

/**
 *
 * @param {*} bundle
 * @returns
 */
async function bundleAndExport(bundle) {
  console.log("Generating bundle with", bundle, tools.wallet);
  let myTx = await arweave.createTransaction(
    {
      data: Buffer.from(JSON.stringify(bundle, null, 2), "utf8")
    },
    tools.wallet
  );

  await arweave.transactions.sign(myTx, tools.wallet);
  const result = await arweave.transactions.post(myTx);
  result.id = myTx.id;
  return result;
}

module.exports = { submitVote };
