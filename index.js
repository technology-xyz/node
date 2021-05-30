#!/usr/bin/env node

const prompts = require("prompts");
const chalk = require("chalk");

const { tools } = require("./src/helpers");
const service = require("./src/service");
const witness = require("./src/witness");

/**
 * Main entry point
 */
async function main() {
  const inputWallet = await prompts({
    type: "text",
    name: "walletPath",
    message: "Enter your wallet location"
  });
  await tools.nodeLoadWallet(inputWallet.walletPath);

  const inputMode = await prompts({
    type: "select",
    name: "mode",
    message: "Select operation mode",

    choices: [
      { title: "Service", value: service },
      { title: "Witness Direct", value: setupWitnessDirect },
      { title: "Witness Indirect", value: witness }
    ]
  });

  await inputMode.mode();
}

/**
 * Setup witness direct node
 * @param {string} walletPath Wallet location
 */
async function setupWitnessDirect() {
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
      message: "Please stake to Vote unless you can’t make a vote"
    });
    stakeAmount = inputStake.stakeAmount;
  }

  await witness(true, stakeAmount);
}

main();
