#!/usr/bin/env node

const knode = require("@_koi/sdk/node");
const tools = new knode.Node();
const { runNode, runVote } = require("./main");
// const { koi_tools } = require("koi_tools");
// const tools = new koi_tools();

const prompts = require("prompts");
const chalk = require("chalk");

const init = async () => {
  let response = await prompts({
    type: "select",
    name: "options",
    message: "Select Option",

    choices: [
      { title: "VoteDirect", value: "voteDirect" },
      { title: "VoteIndirect", value: "voteIndirect" },
    ],
  });

  if (response.options == "voteDirect") {
    let arg;
    response = await prompts({
      type: "text",
      name: "walletLocation",
      message: "enter your Wallet Location",
    });
    let walletLocation = response.walletLocation;
    await tools.nodeLoadWallet(walletLocation);
    const balance = await tools.getWalletBalance();
    const koiBalance = await tools.getKoiBalance();
    const contractState = await tools.getContractState();

    if (balance === "0") {
      let faucetAr = "https://faucet.arweave.net/";
      console.log(
        chalk.green(
          "Your wallet doesn't have Ar token, you can't vote direct." +
            "But you can claim free token here is the link." +
            chalk.blue.underline.bold(`${faucetAr}`)
        )
      );
      return;
    }
    if (!(tools.address in contractState.stakes)) {
      response = await prompts({
        type: "number",
        name: "Stake_Amount",
        message: "Plz stake to Vote unless you Can’t make a vote",
      });
      if (koiBalance == 0) {
        const link = "https://koi.rocks/faucet";
        console.log(
          chalk.green(
            "Your wallet doesn’t have koi balance, here the link " +
              chalk.blue.underline.bold(`${link}`) +
              "," +
              " " +
              "you can get free koi."
          )
        );
        return;
      }
    }
    let stakeAmount = response.Stake_Amount || 0;

    arg = {
      wallet: walletLocation,
      qty: stakeAmount,
      direct: true,
    };
    runNode(arg);
  }

  if (response.options == "voteIndirect") {
    response = await prompts({
      type: "text",
      name: "walletLocation",
      message: "enter your Wallet Location",
    });
    let walletLocation = response.walletLocation;
    let stakeAmount = 0;
    arg = {
      wallet: walletLocation,
      qty: stakeAmount,
      direct: false,
    };
    runVote(arg);
  }
};

(async function () {
  await init();
})();
