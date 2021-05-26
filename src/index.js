#!/usr/bin/env node
"use strict";

const prompts = require("prompts");
const chalk = require("chalk");
const tools = new (require("@_koi/sdk/node").Node)();

const service = require("./service");
const witness = require("./witness");

/**
 * Main entry point
 */
async function main() {
  const inputWallet = await prompts({
    type: "text",
    name: "walletPath",
    message: "Enter your wallet location",
  });

  const inputMode = await prompts({
    type: "select",
    name: "mode",
    message: "Select operation mode",

    choices: [
      { title: "Service", value: setupService },
      { title: "Witness Direct", value: setupWitnessDirect },
      { title: "Witness Indirect", value: witness }, // No setup required
    ],
  });

  await inputMode.mode(inputWallet.walletPath);
}

/**
 * Setup service node
 * @param {string} walletPath Wallet location
 */
async function setupService(walletPath) {
  service(walletPath);
}

/**
 * Setup witness direct node
 * @param {string} walletPath Wallet location
 */
async function setupWitnessDirect(walletPath) {
  await tools.nodeLoadWallet(walletPath);
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

    const inputStake = await prompts({
      type: "number",
      name: "stakeAmount",
      message: "Please stake to Vote unless you can’t make a vote",
    });
    stakeAmount = inputStake.stakeAmount;
  }

  await witnessDirect(walletPath, true, stakeAmount);
}

main().then(process.exit);
