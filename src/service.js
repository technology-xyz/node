const { tools, checkTxConfirmation, rankProposal } = require("./helpers");
const { access } = require("fs/promises");
const { constants } = require("fs");
const axios = require("axios");
const Arweave = require("arweave");

const ADDR_GATEWAY_LOGS = "https://arweave.dev/logs/";

const arweave = Arweave.init({
  host: "arweave.dev",
  protocol: "https",
  port: 443,
  timeout: 20000, // Network request timeouts in milliseconds
  logging: false // Enable network request logging
});

/**
 * Main entry point for service (bundler) node
 */
async function service() {
  // Require dynamically to reduce RAM and load times for witness
  require("dotenv").config();
  const express = require("express");
  const cors = require("cors");
  const cookieParser = require("cookie-parser");

  // Setup middleware and routes
  const app = express();
  app.use(cors());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(cookieParser());
  require("./app/routes")(app);

  // Start the server
  const port = process.env.SERVER_PORT || 8887;
  app.listen(port, () => {
    console.log("Open http://localhost:" + port, "to view in browser");
  });

  // Update state cache every 5 minutes
  const updateStateCache = require("./app/helpers/update_state_cache");
  setInterval(updateStateCache, 300000);
  updateStateCache().then(() => {
    console.log("Initial state cache populated");
  });

  // Start service run loop
  for (;;) await work();
}

/**
 * Main run loop
 */
async function work() {
  console.log("Searching task....");
  const contractState = await tools.getContractState();
  const block = await tools.getBlockHeight();

  if (await isTrafficLogOutdate(contractState, block)) await submitTrafficLog();

  if (voteSubmitActive(contractState, block)) {
    const activeVotes = await activeVoteId(contractState);
    await submitVote(activeVotes);
  }

  if (isProposalRanked(contractState, block)) await rankProposal();

  if (isRewardDistributed(contractState, block)) await distribute();
}

/**
 *
 * @param {*} contractState
 * @param {*} block
 * @returns
 */
async function isTrafficLogOutdate(contractState, block) {
  const trafficLogs = contractState.stateUpdate.trafficLogs;
  const currentTrafficLogs =
    contractState.stateUpdate.trafficLogs.dailyTrafficLog.find(
      (log) => log.block === trafficLogs.open
    );
  const proposedLogs = currentTrafficLogs.proposedLogs;
  const bundlerAddress = tools.address;
  const proposedLog = proposedLogs.find((log) => log.owner === bundlerAddress);

  return block < trafficLogs.close - 420 && proposedLog === undefined;
}

/**
 *
 */
async function submitTrafficLog() {
  var task = "submitting traffic log";
  let arg = {
    gateWayUrl: ADDR_GATEWAY_LOGS,
    stakeAmount: 2
  };

  let tx = await tools.submitTrafficLog(arg);
  await checkTxConfirmation(tx, task);
  console.log("confirmed");
}

/**
 *
 * @param {*} contractState
 * @param {*} block
 * @returns
 */
function voteSubmitActive(contractState, block) {
  const trafficLogs = contractState.stateUpdate.trafficLogs;
  return block > trafficLogs.close - 420 && block < trafficLogs.close - 220;
}

/**
 *
 * @param {*} contractState
 * @returns
 */
async function activeVoteId(contractState) {
  const close = contractState.stateUpdate.trafficLogs.close;
  const votes = contractState.votes;

  // Check if votes are tracked simultaneously
  const areVotesTrackedProms = votes.map((vote) => isVoteTracked(vote.id));
  const areVotesTracked = Promise.all(areVotesTrackedProms);

  // Get active votes
  const activeVotes = [];
  for (let i = 0; i < votes.length; i++)
    if (votes[i].end === close && areVotesTracked[i])
      activeVotes.push(votes[i].id);
  return activeVotes;
}

/**
 * Checks if vote file is present to verify it exists
 * @param {*} voteId
 * @returns {boolean} Whether vote exists
 */
async function isVoteTracked(voteId) {
  const batchFileName = __dirname + "/../app/bundles/" + voteId;
  try {
    await access(batchFileName, constants.F_OK);
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * Interact with koi sdk to call contract batchAction to store/pass the votes in/to state
 * @param {*} activeVotes
 */
async function submitVote(activeVotes) {
  const task = "submitting votes";
  while (activeVotes.length > 0) {
    const voteId = activeVotes[activeVotes.length - 1];
    const state = await tools.getContractState();
    const bundlers = state.votes[voteId].bundlers;
    const bundlerAddress = await tools.getWalletAddress();
    if (!(bundlerAddress in bundlers)) {
      const txId = (await batchUpdateContractState(voteId)).id;
      await checkTxConfirmation(txId, task);
      const arg = {
        batchFile: txId,
        voteId: voteId,
        bundlerAddress: bundlerAddress
      };
      const resultTx = await tools.batchAction(arg);
      await checkTxConfirmation(resultTx, task);
      activeVotes.pop();
    }
    activeVotes.pop();
  }
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

/**
 *
 * @param {*} contractState
 * @param {*} block
 * @returns
 */
function isProposalRanked(contractState, block) {
  const trafficLogs = contractState.stateUpdate.trafficLogs;
  const currentTrafficLogs =
    contractState.stateUpdate.trafficLogs.dailyTrafficLog.find(
      (trafficLog) => trafficLog.block === trafficLogs.open
    );

  return (
    block > trafficLogs.close - 120 &&
    block < trafficLogs.close &&
    currentTrafficLogs.isRanked === false
  );
}

/**
 *
 * @param {*} contractState
 * @param {*} block
 * @returns
 */
function isRewardDistributed(contractState, block) {
  const trafficLogs = contractState.stateUpdate.trafficLogs;
  const currentTrafficLogs =
    contractState.stateUpdate.trafficLogs.dailyTrafficLog.find(
      (trafficLog) => trafficLog.block === trafficLogs.open
    );

  return (
    block > trafficLogs.close && currentTrafficLogs.isDistributed === false
  );
}

/**
 *
 */
async function distribute() {
  var task = "distributing reward";
  let tx = await tools.distributeDailyRewards();
  await checkTxConfirmation(tx, task);
}

module.exports = service;
