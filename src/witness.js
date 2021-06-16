const {
  tools,
  Node,
  OFFSET_BATCH_SUBMIT,
  OFFSET_RANK,
  OFFSET_PROPOSE_SLASH
} = require("./helpers");

/**
 * Transparent interface to initialize and run witness node
 * @param  {...any} args
 */
async function witness(...args) {
  const node = new Witness(...args);
  await node.run();
}

class Witness extends Node {
  /**
   * Main entry point point for witness
   * @param {boolean} direct Wether to transact directly with arweave or use bundler
   * @param {number} stakeAmount Amount to stake
   */
  constructor(direct = false, stakeAmount = 0) {
    super();
    this.direct = direct;
    this.stakeAmount = stakeAmount;
  }

  /**
   * Main run loop
   */
  async run() {
    console.log("Running witness node with address", tools.address);
    if (this.stakeAmount !== 0) await tools.stake(this.stakeAmount);

    for (;;) {
      const state = await tools.getContractState();
      const block = await tools.getBlockHeight();
      console.log(block, "Searching for a task");

      if (this.direct && this.canSubmitTrafficLog(state, block))
        await this.submitTrafficLog(state, block);

      if (checkForVote(state, block)) await this.searchVote(state);

      await this.tryRankDistribute(state, block);

      if (!this.direct && checkProposeSlash(state, block))
        await tools.proposeSlash();
    }
  }

  /**
   * Searches for vote and votes
   * @param {*} state Current contract state data
   */
  async searchVote(state) {
    while (tools.totalVoted < state.votes.length - 1) {
      const id = tools.totalVoted;
      const voteId = id + 1;
      const payload = {
        voteId,
        direct: this.direct
      };
      const { message } = await tools.vote(payload);
      console.log(`for ${voteId} VoteId..........,`, message);
    }
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
  return block < trafficLogs.open + OFFSET_BATCH_SUBMIT;
}

/**
 *
 * @param {*} state
 * @param {number} block Current block height
 * @returns {boolean} If can slash
 */
function checkProposeSlash(state, block) {
  const trafficLogs = state.stateUpdate.trafficLogs;
  return (
    trafficLogs.open + OFFSET_PROPOSE_SLASH < block &&
    block < trafficLogs.open + OFFSET_RANK
  );
}

module.exports = witness;
