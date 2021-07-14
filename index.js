#!/usr/bin/env node
require("dotenv").config();
const prompts = require("prompts");
const fsPromises = require("fs/promises");
const axios = require("axios");
const smartweave = require("smartweave");

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

const { tools, arweave } = require("./src/helpers");
const { verifyStake, setupWebServer, runPeriodic } = require("./src/bundler");

const GATEWAY_URL = "https://arweave.net/";

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
  const state = await tools.getContractState();
  let expressApp;
  if (operationMode === "bundler") {
    if (!(await verifyStake(state))) {
      console.error("Could not verify stake");
      return;
    }
    tools.loadRedisClient();
    expressApp = setupWebServer();
    runPeriodic(); // Don't await to run in parallel
  }

  // Get selected tasks
  const availableTasks = state.tasks.map((task) => ({
    title: `${task.name} - ${task.id}`,
    value: task
  }));
  const selectedTasks = (
    await prompts({
      type: "multiselect",
      name: "selected",
      message: "Select tasks",
      choices: availableTasks,
      hint: "- Space to select. Enter to submit"
    })
  ).selected;

  // Load tasks
  const taskEnv = [tools, fsPromises, expressApp];
  const taskContractsProms = selectedTasks.map((task) =>
    smartweave.readContract(arweave, task.contractTxId)
  );
  const taskContracts = await Promise.all(taskContractsProms);
  const taskSrcProms = taskContracts.map((taskContract) =>
    axios.get(GATEWAY_URL + taskContract.executableTxId)
  );
  const taskSrcs = (await Promise.all(taskSrcProms)).map((res) => res.data);
  const executableTasks = taskSrcs.map((src) => loadTaskSource(src, taskEnv));

  // Initialize tasks then start express app
  await Promise.all(executableTasks.map((task) => task.setup()));
  const port = process.env.SERVER_PORT || 8887;
  expressApp.listen(port, () => {
    console.log(`Open http://localhost:${port} to view in browser`);
  });

  // Execute tasks
  await Promise.all(executableTasks.map((task) => task.execute()));
  console.log("All tasks complete");
}

function loadTaskSource(taskSrc, taskEnv) {
  const loadedTask = new Function(`
      const [tools, fsPromises, expressApp] = arguments;
      ${taskSrc};
      return {setup, execute};
  `);
  return loadedTask(...taskEnv);
}

main();
