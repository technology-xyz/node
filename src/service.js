const {
  tools,
  Node,
  arweave,
  OFFSET_BATCH_SUBMIT,
  OFFSET_PROPOSE_SLASH
} = require("./helpers");
const { access, readFile } = require("fs/promises");
const { constants } = require("fs");
const axios = require("axios");

const BUNDLER_REGISTER = "/register-node";

class Service extends Node {
  constructor(stakeAmount = 0) {
    super();
    this.stakeAmount = stakeAmount;

    // Initialize redis client and webserver
    tools.loadRedisClient();
    this.startWebserver();
    this.next5mPeriod = 0;
    this.next3hPeriod = 0;
  }

  startWebserver() {
    // Require lazily to reduce RAM and load times for witness
    const express = require("express");
    const cors = require("cors");
    const cookieParser = require("cookie-parser");
    const path = require("path");

    // Setup middleware and routes then start server
    const app = express();
    app.use(cors());
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
    app.use(cookieParser());
    let txPath = path.join(__dirname, "app/tx");
    app.use("/tx", express.static(txPath));
    require("./app/routes")(app);
    const port = process.env.SERVER_PORT || 8887;
    app.listen(port, () => {
      console.log("Open http://localhost:" + port, "to view in browser");
    });
  }

  /**
   * Main run loop
   */
  async run() {
    await this.stake();

    let state, block;
    for (;;) {
      this.runPeriodic(); // Remove await to run in parallel

      try {
        [state, block] = await this.getStateAndBlock();
      } catch (e) {
        console.error(e.message);
        continue;
      }

      if (this.canSubmitTrafficLog(state, block)) await this.submitTrafficLog();

      if (canSubmitBatch(state, block)) {
        const activeVotes = await activeVoteId(state);
        await this.submitVote(activeVotes);
      }

      await this.tryRankDistribute(state, block);
    }
  }

  /**
   * Run loop that executes every 5 minutes
   */
  async runPeriodic() {
    const currTime = Date.now();
    if (this.next5mPeriod < currTime) {
      this.next5mPeriod = currTime + 300000;
      console.log("Running 5m periodic tasks");

      // Propagate service nodes
      try {
        await this.propagateRegistry();
      } catch (e) {
        console.error("Error while propagating", e);
      }
    }
  }

  /**
   * Fetch and propagate node registry
   */
  async propagateRegistry() {
    // Don't propagate if this node is a primary node
    if (tools.bundlerUrl === "none") return;
    console.log("Propagating Registry");

    let { registerNodes, getNodes } = require("./app/helpers/nodes"); // Load lazily to wait for Redis
    let nodes = await getNodes();

    // Select a target
    let target;
    if (!nodes || nodes.length === 0) target = tools.bundlerUrl;
    else {
      const selection = nodes[Math.floor(Math.random() * nodes.length)];
      target = selection.data.url;
    }

    // Get targets node registry and add it to ours
    const newNodes = await tools.getNodes(target);
    await registerNodes(newNodes);

    // Don't register if we don't have a URL, we wouldn't be able to direct anyone to us.
    if (!process.env.SERVICE_URL) {
      console.error("SERVICE_URL not set, skipping registration");
      return;
    }

    // Sign payload
    let payload = {
      data: {
        url: process.env.SERVICE_URL,
        timestamp: Date.now()
      }
    };
    payload = await tools.signPayload(payload);

    // Register self in target registry
    axios.post(target + BUNDLER_REGISTER, payload, {
      headers: { "content-type": "application/json" }
    });
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
        let txId;
        try {
          txId = (await batchUpdateContractState(voteId)).id;
        } catch (e) {
          console.error("Unable to submit batch, skipping:", e);
          activeVotes.pop();
          continue;
        }
        if (!(await this.checkTxConfirmation(txId, task))) {
          console.log("Vote submission failed");
          return;
        }
        const arg = {
          batchFile: txId,
          voteId: voteId,
          bundlerAddress: bundlerAddress
        };
        const resultTx = await tools.batchAction(arg);
        task = "batch";
        if (!(await this.checkTxConfirmation(resultTx, task))) {
          console.log("Batch failed");
          return;
        }
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
function canSubmitBatch(state, block) {
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
  // Check if votes are tracked simultaneously
  const votes = state.votes;
  const areVotesTrackedProms = votes.map((vote) => isVoteTracked(vote.id));
  const areVotesTracked = await Promise.all(areVotesTrackedProms);

  // Get active votes
  const close = state.stateUpdate.trafficLogs.close;
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
  const batchStr = await getVotesFile(voteId);
  const batch = batchStr.split("\r\n").map(JSON.parse);
  return await bundleAndExport(batch);
}

/**
 *
 * @param {*} fileId ID of vote file to read
 * @returns {string} Vote file contents in utf8
 */
async function getVotesFile(fileId) {
  const batchFileName = __dirname + "/../bundles/" + fileId;
  await access(batchFileName, constants.F_OK);
  return await readFile(batchFileName, "utf8");
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

module.exports = Service;
