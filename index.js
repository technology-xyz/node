#!/usr/bin/env node
require("dotenv").config();
const prompts = require("prompts");
const chalk = require("chalk");

// Parse cli params
const PARSE_ARGS = [
  "REDIS_IP",
  "REDIS_PORT",
  "AR_WALLET",
  "NODE_MODE",
  "STAKE",
  "SERVICE_URL",
  "TRUSTED_SERVICE_URL",
  "SERVER_PORT"
];
let yargs = require("yargs");
for (const arg of PARSE_ARGS) yargs = yargs.option(arg, { type: "string" });
const argv = yargs.help().argv;
for (const arg of PARSE_ARGS)
  if (argv[arg] !== undefined) process.env[arg] = argv[arg];

const { tools } = require("./src/helpers");
const service = require("./src/service");
const witness = require("./src/witness");

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

  await tools.nodeLoadWallet(walletPath);

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
  await operationMode();
}

/**
 * Setup witness direct node
 */
async function witnessDirect() {
  const balance = await tools.getWalletBalance();
  const koiBalance = await tools.getKoiBalance();
  const contractState = await tools.getContractState();

  if (balance === "0") {
    console.log(
      chalk.green(
        "Your wallet doesn't have any Ar, you can't vote direct, " +
          "but you can claim free Ar here: " +
          chalk.blue.underline.bold("https://faucet.arweave.net/")
      )
    );
    return;
  }

  let stakeAmount = 0;
  if (!(tools.address in contractState.stakes)) {
    if (koiBalance === 0) {
      console.log(
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
              message: "Please stake to Vote unless you can’t make a vote"
            })
          ).stakeAmount;
  }

  return witness(true, stakeAmount);
}

main();
