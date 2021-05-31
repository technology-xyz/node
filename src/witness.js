const { tools, checkTxConfirmation, rankProposal } = require("./helpers");

/**
 * Main entry point point for witness
 * @param {string} walletPath Path of wallet json
 * @param {boolean} direct Wether to transact directly with arweave or use bundler
 * @param {number} stakeAmount Amount to stake
 */
async function witness(direct = false, stakeAmount = 0) {
  let isRanked = false,
    isDistributed = false;

  console.log("Running node with address", tools.address);

  if (stakeAmount !== 0) await tools.stake(stakeAmount);
  for (;;) await work(); // Start run loop

  /**
   * Run loop
   */
  async function work() {
    const contractState = tools.getContractState();
    const block = await tools.getBlockHeight();
    console.log(tools.address, "is looking for a task to join");

    if (checkForVote(contractState, block))
      await searchVote(contractState, direct);

    if (isProposalRanked(contractState, block, isRanked)) {
      await rankProposal();
      isRanked = true;
    }

    if (isRewardDistributed(contractState, block)) await distribute();

    if (!direct && checkProposeSlash(contractState, block))
      await tools.proposeSlash();
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
      (trafficLog) => trafficLog.block === trafficLogs.open
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
    const voteId = id + 1;
    const payload = {
      voteId,
      direct
    };
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
 * @param {*} contractState
 * @param {number} block Current block height
 * @returns {boolean} If can slash
 */
function checkProposeSlash(contractState, block) {
  const trafficLogs = contractState.stateUpdate.trafficLogs;
  return block > trafficLogs.close - 150 && block < trafficLogs.close - 75;
}

module.exports = witness;
