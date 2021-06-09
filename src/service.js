const { tools, Node } = require("./helpers");
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
 * Transparent interface to initialize and run service node
 */
async function service() {
  const node = new Service();
  await node.run();
}

class Service extends Node {
  constructor() {
    super();

    tools.loadRedisClient();

    // Require lazily to reduce RAM and load times for witness
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
  }

  /**
   * Main run loop
   */
  async run() {
    for (;;) {
      const state = await tools.getContractState();
      const block = await tools.getBlockHeight();
      console.log(block, "Searching for a task");

      if (await isTrafficLogOutdate(state, block))
        await this.submitTrafficLog();

      if (voteSubmitActive(state, block)) {
        const activeVotes = await activeVoteId(state);
        await this.submitVote(activeVotes);
      }

      await this.tryRankDistribute(state, block);
    }
  }

  /**
   *
   */
  async submitTrafficLog() {
    var task = "submitting traffic log";
    let arg = {
      gateWayUrl: ADDR_GATEWAY_LOGS,
      stakeAmount: 2
    };

    let tx = await tools.submitTrafficLog(arg);
    await this.checkTxConfirmation(tx, task);
    console.log("confirmed");
  }

  /**
   * Interact with koi sdk to call contract batchAction to store/pass the votes in/to state
   * @param {*} activeVotes
   */
  async submitVote(activeVotes) {
    let task = "submitting votes";
    while (activeVotes.length > 0) {
      const voteId = activeVotes[activeVotes.length - 1];
      const state = await tools.getContractState();
      const bundlers = state.votes[voteId].bundlers;
      const bundlerAddress = await tools.getWalletAddress();
      if (!(bundlerAddress in bundlers)) {
        const txId = (await batchUpdateContractState(voteId)).id;
        await this.checkTxConfirmation(txId, task);
        const arg = {
          batchFile: txId,
          voteId: voteId,
          bundlerAddress: bundlerAddress
        };
        const resultTx = await tools.batchAction(arg);
        task = "batch";
        await this.checkTxConfirmation(resultTx, task);
        activeVotes.pop();
      }
      activeVotes.pop();
    }
  }
}

/**
 *
 * @param {*} state
 * @param {*} block
 * @returns
 */
function isTrafficLogOutdate(state, block) {
  const trafficLogs = state.stateUpdate.trafficLogs;
  const currentTrafficLogs = state.stateUpdate.trafficLogs.dailyTrafficLog.find(
    (log) => log.block === trafficLogs.open
  );
  const proposedLogs = currentTrafficLogs.proposedLogs;
  const bundlerAddress = tools.address;
  const proposedLog = proposedLogs.find((log) => log.owner === bundlerAddress);
  const proposedGateWay = proposedLogs.find(
    (log) => log.gateWayId === "https://arweave.dev/logs/"
  );

  return (
    block < trafficLogs.close - 420 &&
    proposedLog === undefined &&
    proposedGateWay
  );
}

/**
 *
 * @param {*} state
 * @param {*} block
 * @returns
 */
function voteSubmitActive(state, block) {
  const trafficLogs = state.stateUpdate.trafficLogs;
  const close = trafficLogs.close;
  const activeVotes = state.votes.filter((vote) => vote.end == close);
  for (let vote of activeVotes) {
    return (
      block > trafficLogs.close - 250 &&
      block < trafficLogs.close - 150 &&
      JSON.stringify(vote.bundlers) === "{}"
    );
  }
  return false;
}

/**
 *
 * @param {*} state
 * @returns
 */
async function activeVoteId(state) {
  const activeVotes = [];
  const close = state.stateUpdate.trafficLogs.close;
  const votes = state.votes;
  const trackedVotes = votes.filter((vote) => vote.end == close);
  for (let vote of trackedVotes) {
    activeVotes.push(vote.id);
  }
  return activeVotes;
  /*
  // Check if votes are tracked simultaneously
  const areVotesTrackedProms = votes.map((vote) => isVoteTracked(vote.id));
  const areVotesTracked = await Promise.all(areVotesTrackedProms);

  // Get active votes
  const activeVotes = [];
  for (let i = 0; i < votes.length; i++)
    if (votes[i].end === close && areVotesTracked[i])
      activeVotes.push(votes[i].id);
  return activeVotes;
  */
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
  return new Promise(function (resolve, reject) {
    axios
      .post("https://bundler.openkoi.com:8888/getBatch/", proposal)
      .then((res) => {
        resolve(res.data);
      })
      .catch((error) => {
        reject(error);
      });
  });
}

/**
 *
 * @param {*} bundle
 * @returns
 */
async function bundleAndExport(bundle) {
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

module.exports = service;
