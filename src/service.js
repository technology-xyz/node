const { tools, Node, arweave } = require("./helpers");
const { access } = require("fs/promises");
const { constants } = require("fs");
const axios = require("axios");
const { promisify } = require("util");

const BUNDLER_REGISTER = "/register-node";
const OFFSET_BATCH_SUBMIT = 400;
const OFFSET_PROPOSE_SLASH = 600;

/**
 * Transparent interface to initialize and run service node
 */
async function service() {
  const node = new Service();
  node.run();
}

class Service extends Node {
  constructor() {
    super();

    // Initialize redis client
    tools.loadRedisClient();
    this.redisSetAsync = promisify(tools.redisClient.set).bind(
      tools.redisClient
    );
    this.redisGetAsync = promisify(tools.redisClient.get).bind(
      tools.redisClient
    );

    // On startup, only do discovery with primary service node.

    // Start webserver
    this.startWebserver();

    // Run periodic tasks for the first time
    this.run_periodic();

    // Start periodic run loop
    setInterval(this.run_periodic, 300000);
  }

  /**
   * Main run loop
   */
  async run() {
    for (;;) {
      const state = await tools.getContractState();
      const block = await tools.getBlockHeight();
      console.log(block, "Searching for a task");

      if (await this.canSubmitTrafficLog(state, block))
        await this.submitTrafficLog();

      if (voteSubmitActive(state, block)) {
        const activeVotes = await activeVoteId(state);
        await this.submitVote(activeVotes);
      }

      await this.tryRankDistribute(state, block);
    }
  }

  /**
   * Run loop that executes every 5 minutes
   */
  async run_periodic() {
    console.log("Running periodic tasks");

    // Propagate service nodes
    try {
      await this.propagateRegistry();
    } catch (e) {
      console.log("Error while propagating", e);
    }

    // Redis update current state
    try {
      await this.updateRedisStateCached();
    } catch (e) {
      console.log(e);
    }
  }

  /**
   * Fetch and propagate node registry
   * TODO: separate into smaller functions that can be used in /register-node endpoint
   */
  async propagateRegistry() {
    // Don't propagate if
    if (
      tools.bundlerUrl === null || // this node is a primary node
      tools.bundlerUrl === "null"
    )
      return;

    let { registerNodes, getNodes } = require("./app/helpers/nodes"); // Load lazily to wait for Redis
    let nodes = await getNodes();

    // Select a target
    let target;
    if (!nodes || nodes.length === 0) target = this.bundlerUrl;
    else {
      const selection = nodes[Math.floor(Math.random() * nodes.length)];
      target = selection.data.url;
    }

    // Get targets node registry and add it to ours
    const newNodes = await tools.getNodes(target);
    await registerNodes(newNodes);

    // Don't register if we don't have a URL, we wouldn't be able to direct anyone to us.
    if (!process.env.SERVICE_URL) {
      console.log("SERVICE_URL not set, skipping registration");
      return;
    }

    // Sign payload
    const payload = {
      data: {
        url: process.env.SERVICE_URL,
        timestamp: Date.now()
      }
    };
    tools.signPayload(payload);

    // Register self in target registry
    axios.post(target + BUNDLER_REGISTER, payload, {
      headers: { "content-type": "application/json" }
    });
  }

  /**
   *
   */
  async updateRedisStateCached() {
    const currentState = await tools.getContractState();
    await this.redisSetAsync(
      "currentStateCached",
      JSON.stringify(currentState)
    );
  }

  startWebserver() {
    // Require lazily to reduce RAM and load times for witness
    const express = require("express");
    const cors = require("cors");
    const cookieParser = require("cookie-parser");

    // Setup middleware and routes then start server
    const app = express();
    app.use(cors());
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
    app.use(cookieParser());
    require("./app/routes")(app);
    const port = process.env.SERVER_PORT || 8887;
    app.listen(port, () => {
      console.log("Open http://localhost:" + port, "to view in browser");
    });
  }

  /**
   * Interact with koi sdk to call contract batchAction to store/pass the votes in/to state
   * @param {*} activeVotes
   */
  async submitVote(activeVotes) {
    const task = "submitting votes";
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
function voteSubmitActive(state, block) {
  const trafficLogs = state.stateUpdate.trafficLogs;
  return (
    trafficLogs.open + OFFSET_BATCH_SUBMIT < block &&
    block < trafficLogs.open + OFFSET_PROPOSE_SLASH
  );
}

/**
 *
 * @param {*} state
 * @returns
 */
async function activeVoteId(state) {
  const close = state.stateUpdate.trafficLogs.close;
  const votes = state.votes;

  // Check if votes are tracked simultaneously
  const areVotesTrackedProms = votes.map((vote) => isVoteTracked(vote.id));
  const areVotesTracked = await Promise.all(areVotesTrackedProms);

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

module.exports = service;
