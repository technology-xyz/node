"use strict";

const tools = require("./tools");

/**
 * Main entry point point for witness
 * @param {string} walletPath Path of wallet json
 * @param {boolean} direct Wether to transact directly with arweave or use bundler
 * @param {number} stakeAmount Amount to stake
 */
async function witness(direct = false, stakeAmount = 0) {
  // Require dynamically to reduce RAM and load times for service
  const { getCacheData, ADDR_BUNDLER_CURRENT } = require("@_koi/sdk/common");

  let isRanked = false,
    isDistributed = false;

  console.log("Running node with address", tools.address);

  await tools.stake(stakeAmount);
  for (;;) await work(); // Start run loop

  /**
   * Run loop
   */
  async function work() {
    const stateData = (await getCacheData(ADDR_BUNDLER_CURRENT)).data;
    const block = await tools.getBlockHeight();
    console.log(tools.address, "is looking for a task to join");

    if (checkForVote(stateData, block)) await searchVote(stateData);

    if (isProposalRanked(stateData, block, isRanked)) await rankProposal();

    if (isRewardDistributed(stateData, block)) await distribute();

    if (!direct && checkProposeSlash(stateData, block))
      await tools.proposeSlash();
  }

  /**
   *
   */
  async function rankProposal() {
    const task = "ranking reward";
    const tx = await tools.rankProposal();
    await checkTxConfirmation(tx, task);
    isRanked = true;
  }

  /**
   *
   * @param {*} state Current contract state data
   * @param {number} block Block height
   * @returns {boolean} Whether the reward is distributed
   */
  function isRewardDistributed(state, block) {
    const trafficLogs = state.stateUpdate.trafficLogs;
    if (!trafficLogs.dailyTrafficLog.length) return false;
    const currentTrafficLogs = trafficLogs.dailyTrafficLog.find(
      (trafficlog) => trafficlog.block === trafficLogs.open
    );
    let distribute = currentTrafficLogs.isDistributed || isDistributed;
    if (block > trafficLogs.close && !distribute) {
      isRanked = false;
      return true;
    }
    return false;
  }

  /**
   *
   */
  async function distribute() {
    const task = "distributing reward";
    const tx = await tools.distributeDailyRewards();
    await checkTxConfirmation(tx, task);
    isDistributed = true;
  }
}

/**
 * Checks if voting is available
 * @param {*} state Contract state data
 * @param {number} block Current block height
 * @returns {boolean} Whether voting is possible
 */
function checkForVote(state, block) {
  const trafficLogs = state.stateUpdate.trafficLogs;
  return block < trafficLogs.close - 250;
}

/**
 * Searches for vote and votes
 * @param {*} state Current contract state data
 * @param {boolean} direct Wether to transact directly with arweave or use bundler
 */
async function searchVote(state, direct) {
  while (tools.totalVoted < state.votes.length - 1) {
    const id = tools.totalVoted;
    let voteId = id + 1;
    const payload = {
      voteId,
      direct
    };
    console.log(voteId);
    const { message } = await tools.vote(payload);

    console.log(`for ${voteId} VoteId..........,`, message);
  }
}

/**
 * Checks wether proposal is ranked or not
 * @param {*} state Current contract state data
 * @param {number} block Block height
 * @param {boolean} isRanked Current proposal rank state
 * @returns {boolean} Whether the proposal is ranked or not
 */
function isProposalRanked(state, block, isRanked) {
  const trafficLogs = state.stateUpdate.trafficLogs;
  if (!trafficLogs.dailyTrafficLog.length) return false;
  const currentTrafficLogs = trafficLogs.dailyTrafficLog.find(
    (trafficLog) => trafficLog.block === trafficLogs.open
  );

  if (currentTrafficLogs.isRanked || isRanked) return false;
  return block > trafficLogs.close - 75 && block < trafficLogs.close;
}

/**
 *
 * @param {string} txId // Transaction ID
 * @param {*} task
 */
async function checkTxConfirmation(txId, task) {
  let num = 0;
  for (;;) {
    console.log("tx is being added to blockchain ......" + ++num + "% " + task);
    try {
      await tools.getTransaction(txId);
      console.log("transaction found");
      break;
    } catch (err) {
      if (err.type !== "TX_FAILED") throw err;
      console.log("failed... retrying");
    }
  }
}

/**
 *
 * @param {*} stateData
 * @param {number} block Current block height
 * @returns {boolean} If can slash
 */
function checkProposeSlash(stateData, block) {
  const trafficLogs = stateData.stateUpdate.trafficLogs;
  return block > trafficLogs.close - 150 && block < trafficLogs.close - 75;
}

module.exports = witness;
