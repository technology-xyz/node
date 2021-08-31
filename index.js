#!/usr/bin/env node
require("dotenv").config();
const prompts = require("prompts");
const chalk = require("chalk");
const kohaku = require("@_koi/kohaku");

// Parse cli params
const PARSE_ARGS = [
  "REDIS_IP",
  "REDIS_PORT",
  "AR_WALLET",
  "NODE_MODE",
  "STAKE",
  "SERVICE_URL",
  "TRUSTED_SERVICE_URL",
  "SERVER_PORT",
  "RESTORE_KOHAKU"
];
let yargs = require("yargs");
for (const arg of PARSE_ARGS) yargs = yargs.option(arg, { type: "string" });
const argv = yargs.help().argv;
for (const arg of PARSE_ARGS)
  if (argv[arg] !== undefined) process.env[arg] = argv[arg];
process.env.SERVER_PORT = process.env.SERVER_PORT || 8887;

const { tools, arweave } = require("./src/helpers");
const Service = require("./src/service");
const Witness = require("./src/witness");

/**
 * Main entry point
 */
async function main() {
  // Get wallet path and load it
  const walletPath =
    process.env.AR_WALLET !== undefined
      ? process.env.AR_WALLET
      : (
          await prompts({
            type: "text",
            name: "walletPath",
            message: "Enter your wallet location"
          })
        ).walletPath;

  // Get operation mode
  const operationMode =
    process.env.NODE_MODE !== undefined
      ? eval(process.env.NODE_MODE)
      : (
          await prompts({
            type: "select",
            name: "mode",
            message: "Select operation mode",

            choices: [
              { title: "Service", value: service },
              { title: "Witness Direct", value: witnessDirect },
              { title: "Witness Indirect", value: witness }
            ]
          })
        ).mode;

  // Run the node
  console.log("Operation mode:", operationMode.name);
  process.env["NODE_MODE"] = operationMode.name;

  await operationMode(walletPath);
}

/**
 * Setup witness direct node
 */
async function service(walletPath) {
  tools.loadRedisClient();
  const jwk = await tools.loadFile(walletPath);
  await tools.loadWallet(jwk);
  console.log("Loaded wallet with address", await tools.getWalletAddress());

  // Fully initialize Kohaku
  if (process.env["RESTORE_KOHAKU"] !== "false") {
    const restore = await tools.redisGetAsync("kohaku");
    if (restore) {
      console.log("Importing Kohaku restore point");
      await kohaku.importCache(arweave, restore);
    } else {
      console.log(
        "Attempted to restore Kohaku but redis[kohaku] was invalid:",
        restore
      );
    }
  }
  console.log("Building cache from", kohaku.getCacheHeight());
  await tools.getKoiiStateAwait();
  const initialHeight = kohaku.getCacheHeight();
  console.log("Kohaku initialized to height", kohaku.getCacheHeight());
  if (initialHeight < 1) throw new Error("Failed to initialize");

  await verifyStake(Service);
}

/**
 * Setup witness direct node
 */
async function witnessDirect(walletPath) {
  await tools.nodeLoadWallet(walletPath);
  console.log("Loaded wallet with address", await tools.getWalletAddress());
  await verifyStake(Witness);
}

/**
 * Setup witness indirect node
 */
async function witness(walletPath) {
  await tools.nodeLoadWallet(walletPath);
  console.log("Loaded wallet with address", await tools.getWalletAddress());
  const node = new Witness();
  await node.run();
}

/**
 * Verify the address has staked
 * @param {*} nodeClass
 */
async function verifyStake(nodeClass) {
  const contractState = await tools.getKoiiState();
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
    return;
  }

  let stakeAmount = 0;
  if (!(tools.address in contractState.stakes)) {
    if (koiBalance === 0) {
      console.error(
        chalk.green(
          "Your wallet doesn’t have koi balance, claim some free Koi here: " +
            chalk.blue.underline.bold("https://koi.rocks/faucet")
        )
      );
      return;
    }

    // Get and set stake amount
    stakeAmount =
      process.env.STAKE !== undefined
        ? parseInt(process.env.STAKE)
        : (
            await prompts({
              type: "number",
              name: "stakeAmount",
              message: "Please stake to Vote"
            })
          ).stakeAmount;
    if (stakeAmount < 1) {
      console.error("Stake amount too low. Aborting.");
      return;
    }
  }

  const node = new nodeClass(stakeAmount, true);
  await node.run();
}

main();
