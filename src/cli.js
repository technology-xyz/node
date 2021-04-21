#!/usr/bin/env node

const smartweave = require("smartweave");
const Arweave = require("arweave/node");
const runNode = require("./main");

const arweave = Arweave.init({
  host: "arweave.net",
  protocol: "https",
  port: 443,
});
// const koi_contract = "UGG1xAjpBU2gq66elzgiT_r1obYkwuoxO80YJ97n5dk";
const koi_contract = "ljy4rdr6vKS6-jLgduBz_wlcad4GuKPEuhrRVaUd8tg";
const prompts = require("prompts");
const fetch = require("node-fetch");
const fs = require("jsonfile");

const interactWrite = async (inputs) => {
  let input = {
    function: inputs.function,
    taskId: inputs.taskId,
    taskName: inputs.taskName,
    taskFileURL: inputs.taskFileURL,
    KOI_Reward: inputs.KOI_Reward,
  };
  try {
    let wallet = await loadFile(input.walletFileLocation);
    let txId = await smartweave.interactWrite(
      arweave,
      wallet,
      koi_contract,
      input
    );
    console.log(
      "Sucessfully added to Arweave (It might take some time to reflect on arweave state) - TxId: ",
      txId
    );
  } catch (e) {
    console.log(e);
  }
};
function loadFile(fileName) {
  return new Promise(function (resolve, reject) {
    fs.readFile(fileName)
      .then((file) => {
        resolve(file);
      })
      .catch((err) => {
        reject(err);
      });
  });
}

const init = async () => {
  // const latestState = await getCurrentState();
  // const KOI_TASKS = latestState.KOI_TASKS;
  let response = await prompts({
    type: "select",
    name: "options",
    message: "Select Option",
    choices: [
      { title: "Vote", value: "vote" },
      { title: "Show KOI Tasks", value: "showTasks" },
      { title: "Add KOI Task", value: "addTask" },
    ],
  });
  if (response.options == "showTasks") {
    const latestState = await getCurrentState();
    const KOI_TASKS = latestState.KOI_TASKS;
    if (latestState && latestState.KOI_TASKS) {
      console.log("\n");
      for (let i = 0; i < latestState.KOI_TASKS.length; i++) {
        console.log(
          latestState.KOI_TASKS[i].TaskId +
            " - " +
            latestState.KOI_TASKS[i].TaskName
        );
      }
    } else {
      console.log("No Tasks Available");
      return;
    }
    response = await prompts({
      type: "text",
      name: "KOI_TASK_ID",
      message: "enter KOI Task ID or KOI Task Name?",
    });
    let KOI_TASK_ID = response.KOI_TASK_ID;
    let KOI_Task = KOI_TASKS.filter(
      (e) => e.TaskId == KOI_TASK_ID || e.TaskName == KOI_TASK_ID
    );
    if (KOI_Task.length <= 0) {
      console.log("NO task found with this ID");
      return;
    }
    await executeKOITask(KOI_Task[0].TaskFileURL, KOI_Task[0].TaskName);
  } else if (response.options == "addTask") {
    response = await prompts({
      type: "text",
      name: "taskName",
      message: "enter KOI Task Name",
    });
    let taskName = response.taskName;
    response = await prompts({
      type: "text",
      name: "walletLocation",
      message: "enter your Wallet Location",
    });
    let walletLocation = response.walletLocation;
    response = await prompts({
      type: "text",
      name: "taskUrl",
      message: "enter KOI Task File Url (Uploaded on Arweave permaweb)",
    });
    let taskUrl = response.taskUrl;
    response = await prompts({
      type: "text",
      name: "KOI_Reward",
      message: "enter KOI_Reward for this task",
    });
    let KOI_Reward = response.KOI_Reward;

    interactWrite({
      function: "registerNewTask",
      taskId: Math.floor(Math.random() * 1e16),
      taskName: taskName,
      taskFileURL: taskUrl,
      KOI_Reward: KOI_Reward,
      walletLocation: walletLocation,
    });

    // TODO: Add validation on smart contract and sdk

    // TODO: Possibly move the getState and other logic on bundler
  } else if (response.options == "vote") {
    let arg;
    response = await prompts({
      type: "text",
      name: "walletLocation",
      message: "enter your Wallet Location",
    });
    let walletLocation = response.walletLocation;
    response = await prompts({
      type: "number",
      name: "Stake_Amount",
      message: "enter Stake_Amount",
    });
    let stakeAmount = response.Stake_Amount;
    response = await prompts({
      type: "select",
      name: "options",
      message: "Select Option",
      choices: [
        { title: "Vote_Direct", value: "voteDirect" },
        { title: "Vote_InDirect", value: "voteIndirect" },
      ],
    });
    if (response.options == "voteDirect") {
      arg = {
        wallet: walletLocation,
        qty: stakeAmount,
        direct: true,
      };
    } else if (response.options == "voteIndirect") {
      arg = {
        wallet: walletLocation,
        qty: stakeAmount,
        direct: false,
      };
    }
    runNode(arg);
  }
};
executeKOITask = async (url, taskName) => {
  console.log(`STARTING ${taskName}`);
  let res = await fetch(url);
  let result = await res.text();
  eval(result);
  let outputData = await handle();
  if (outputData) {
    console.log(outputData);
  }
};
const getCurrentState = async () => {
  try {
    let latestState = await readContract();
    return latestState;
  } catch (e) {
    console.log(e);
  }
};

async function readContract() {
  return new Promise(function (resolve, reject) {
    smartweave
      .readContract(arweave, koi_contract)
      .then((state) => {
        resolve(state);
      })
      .catch((err) => {
        reject(err);
      });
  });
}

(async function () {
  await init();
})();
