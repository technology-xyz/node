const { tools } = require("./helpers");
const axios = require("axios");
const BUNDLER_REGISTER = "/register-node";
const prompts = require("prompts");

const MS_TO_MIN = 60000;
const TIMEOUT_TX = 30 * MS_TO_MIN;

/**
 * Verify the address has staked
 * @state {*} Contract state
 * @returns {bool} Whether stake is verified
 */
async function verifyStake(state) {
  const chalk = require("chalk");
  const balance = await tools.getWalletBalance();
  const koiBalance = await tools.getKoiBalance();
  console.log(`Balance: ${balance}AR, ${koiBalance}KOI`);

  if (balance === "0") {
    console.error(
      chalk.green(
        "Your wallet doesn't have any Ar, you can't interact directly, " +
          "but you can claim free Ar here: " +
          chalk.blue.underline.bold("https://faucet.arweave.net/")
      )
    );
    return false;
  }

  let stakeAmount = 0;
  if (!(tools.address in state.stakes)) {
    if (koiBalance === 0) {
      console.error(
        chalk.green(
          "Your wallet doesn’t have koi balance, claim some free Koi here: " +
            chalk.blue.underline.bold("https://koi.rocks/faucet")
        )
      );
      return false;
    }

    // Get and set stake amount
    stakeAmount =
      process.env.STAKE !== undefined
        ? parseInt(process.env.STAKE)
        : (
            await prompts({
              type: "number",
              name: "stakeAmount",
              message: "Please stake operate as Service"
            })
          ).stakeAmount;
    if (stakeAmount < 1) {
      console.error("Stake amount too low. Aborting.");
      return false;
    }

    console.log("Staking", stakeAmount);
    const txId = await tools.stake(stakeAmount);
    return await checkTxConfirmation(txId, "staking");
  }
  return true;
}

/**
 * Does basic configure for express app
 * @returns express app
 */
function setupWebServer() {
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
  return app;
}

/**
 * Run loop that executes every 5 minutes
 */
async function runPeriodic() {
  console.log("Running periodic jobs");

  // Propagate service nodes
  try {
    await propagateRegistry();
  } catch (e) {
    console.error("Error while propagating", e);
  }

  setTimeout(runPeriodic, 300000);
}

/**
 * Fetch and propagate node registry
 */
async function propagateRegistry() {
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
 *
 * @param {string} txId // Transaction ID
 * @param {*} task
 * @returns {bool} Whether transaction was found (true) or timedout (false)
 */
async function checkTxConfirmation(txId, task) {
  const start = new Date().getTime() - 1;
  const update_period = MS_TO_MIN * 5;
  const timeout = start + TIMEOUT_TX;
  let next_update = start + update_period;
  console.log(`Waiting for "${task}" TX to be mined`);
  for (;;) {
    const now = new Date().getTime();
    const elapsed_mins = Math.round((now - start) / MS_TO_MIN);
    if (now > timeout) {
      console.log(`${task}" timed out after waiting ${elapsed_mins}m`);
      return false;
    }
    if (now > next_update) {
      next_update = now + update_period;
      console.log(`${elapsed_mins}m waiting for "${task}" TX to be mined `);
    }
    try {
      await tools.getTransaction(txId);
      console.log(`Transaction found in ${elapsed_mins}m`);
      return true;
    } catch (_err) {
      // Silently catch error, might be dangerous
    }
  }
}

module.exports = { verifyStake, setupWebServer, runPeriodic };
