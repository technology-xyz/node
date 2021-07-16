#!/usr/bin/env node
require("dotenv").config();
const prompts = require("prompts");
// const axios = require("axios");
const smartweave = require("smartweave");
const { constants } = require("fs");
const fs = require("fs/promises");

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

const { tools, arweave, Namespace } = require("./src/helpers");
const { verifyStake, setupWebServer, runPeriodic } = require("./src/bundler");

// const GATEWAY_URL = "https://arweave.net/";

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
  console.log("Loaded wallet with address", await tools.getWalletAddress());

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
              { title: "Bundler", value: "bundler" },
              { title: "Witness", value: "witness" } // Indirect
            ]
          })
        ).mode;

  // Prepare bundler mode
  const state = await smartweave.readContract(
    // Replace with tools.getContractState()
    arweave,
    "L2kUJFK63AI9e7zDPtecWsU4Lfku4p1znLpYOVv5FoU"
  );
  if (operationMode === "bundler" && !(await verifyStake(state))) {
    console.error("Could not verify stake");
    return;
  }

  // // Get selected tasks
  // const availableTasks = state.tasks.map((task) => ({
  //   title: `${task.name} - ${task.id}`,
  //   value: task
  // }));
  // const selectedTasks = (
  //   await prompts({
  //     type: "multiselect",
  //     name: "selected",
  //     message: "Select tasks",
  //     choices: availableTasks,
  //     hint: "- Space to select. Enter to submit",
  //     instructions: false
  //   })
  // ).selected;

  // Initialize bundler
  let expressApp;
  if (operationMode === "bundler") {
    tools.loadRedisClient();
    expressApp = setupWebServer();
    runPeriodic(); // Don't await to run in parallel
  }

  // Load tasks
  /*
  const taskStateProms = selectedTasks.map((task) =>
    smartweave.readContract(arweave, task.txId)
  );
  const taskStates = await Promise.all(taskStateProms);
  const taskSrcProms = taskStates.map((taskState) =>
    axios.get(GATEWAY_URL + taskState.executableTxId)
  );
  const taskSrcs = (await Promise.all(taskSrcProms)).map((res) => res.data);
  const executableTasks = taskSrcs.map((src, i) =>
    loadTaskSource(src, new Namespace(selectedTasks[i].txId, expressApp))
  );
  */

  const taskStates = [null];
  const taskSrcs = [await fs.readFile("executable.js", "utf8")];
  const executableTasks = taskSrcs.map((src) =>
    loadTaskSource(src, new Namespace("test", expressApp))
  );

  // Initialize tasks then start express app
  await Promise.all(
    executableTasks.map((task, i) => task.setup(taskStates[i]))
  );
  const port = process.env.SERVER_PORT || 8887;
  expressApp.listen(port, () => {
    console.log(`Open http://localhost:${port} to view in browser`);
  });

  // Execute tasks
  await Promise.all(
    executableTasks.map((task, i) => task.execute(taskStates[i]))
  );
  console.log("All tasks complete");
}

/**
 * @param {string} taskSrc // Source of contract
 * @param {Namespace} namespace // Wrapper object for redis, express, and filesystem
 * @returns // Executable task
 */
function loadTaskSource(taskSrc, namespace) {
  const loadedTask = new Function(`
      const [tools, arweave, smartweave, fsConstants, namespace] = arguments;
      ${taskSrc};
      return {setup, execute};
  `);
  return loadedTask(tools, arweave, smartweave, constants, namespace);
}

main();
