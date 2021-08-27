#!/usr/bin/env node
require("dotenv").config();
const prompts = require("prompts");
const kohaku = require("@_koi/kohaku");
const axios = require("axios");

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
  "TASKS",
  "RESTORE_KOHAKU"
];
let yargs = require("yargs");
for (const arg of PARSE_ARGS) yargs = yargs.option(arg, { type: "string" });
const argv = yargs.help().argv;
for (const arg of PARSE_ARGS)
  if (argv[arg] !== undefined) process.env[arg] = argv[arg];

const { tools, arweave, Namespace } = require("./src/helpers");
const { verifyStake, setupWebServer, runPeriodic } = require("./src/service");

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

  await tools.loadWallet(await tools.loadFile(walletPath));
  console.log("Loaded wallet with address", await tools.getWalletAddress());

  // Get operation mode
  const operationMode =
    process.env.NODE_MODE ||
    (
      await prompts({
        type: "select",
        name: "mode",
        message: "Select operation mode",

        choices: [
          { title: "Service", value: "service" },
          { title: "Witness", value: "witness" } // Indirect
        ]
      })
    ).mode;

  if (operationMode === "service") tools.loadRedisClient();

  // Fully initialize Kohaku (maybe only do this for service node, but witness can't get state for now so this is okay)
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
  const state = await tools.getContractStateAwait();

  // Prepare service mode
  if (operationMode === "service" && !(await verifyStake(state))) {
    console.error("Could not verify stake");
    return;
  }

  // Get selected tasks
  console.log("Finding tasks");
  const taskStateProms = state.tasks.map((task) =>
    kohaku.readContract(arweave, task.txId)
  );
  const taskStates = await Promise.all(taskStateProms);
  const availableTasks = taskStates.map((taskState, i) => ({
    title: `${taskState.name} - ${state.tasks[i].txId}`,
    value: [state.tasks[i].txId, taskState]
  }));
  let selectedTasks;
  if (process.env.TASKS) {
    const taskIds = process.env.TASKS.split(",");
    selectedTasks = availableTasks
      .filter((task) => taskIds.includes(task.value[0]))
      .map((task) => task.value);
  } else {
    selectedTasks = (
      await prompts({
        type: "multiselect",
        name: "selected",
        message: "Select tasks",
        choices: availableTasks,
        hint: "- Space to select. Enter to submit",
        instructions: false
      })
    ).selected;
  }

  // Initialize service
  let expressApp;
  if (operationMode === "service") {
    tools.loadRedisClient();
    expressApp = setupWebServer();
    const taskNames = JSON.stringify(selectedTasks.map((task) => task[0]));
    expressApp.get("/tasks", (_req, res) => {
      res.type("application/json");
      res.send(taskNames);
    });
    runPeriodic(); // Don't await to run in parallel
  }

  // Load tasks
  const taskSrcProms = selectedTasks.map((task) =>
    axios.get(GATEWAY_URL + task[1].executableId)
  );
  const taskSrcs = (await Promise.all(taskSrcProms)).map((res) => res.data);
  const executableTasks = taskSrcs.map((src, i) =>
    loadTaskSource(src, new Namespace(selectedTasks[i][0], expressApp))
  );

  // Initialize tasks then start express app
  await Promise.all(
    executableTasks.map((task, i) => task.setup(selectedTasks[i][1]))
  );
  const port = process.env.SERVER_PORT || 8887;
  if (operationMode === "service") {
    expressApp.listen(port, () => {
      console.log(`Open http://localhost:${port} to view in browser`);
    });
  }

  // Execute tasks
  await Promise.all(
    executableTasks.map((task, i) => {
      console.log("Running task", selectedTasks[i][0]);
      task.execute(selectedTasks[i][1]);
    })
  );
}

/**
 * @param {string} taskSrc // Source of contract
 * @param {Namespace} namespace // Wrapper object for redis, express, and filesystem
 * @returns // Executable task
 */
function loadTaskSource(taskSrc, namespace) {
  const loadedTask = new Function(`
      const [tools, namespace, require] = arguments;
      ${taskSrc};
      return {setup, execute};
  `);
  return loadedTask(tools, namespace, require);
}

main();
