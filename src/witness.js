const {
  tools,
  Node,
  OFFSET_BATCH_SUBMIT,
  OFFSET_RANK,
  OFFSET_PROPOSE_SLASH
} = require("./helpers");

class Witness extends Node {
  /**
   * Main entry point point for witness
   * @param {boolean} direct Wether to transact directly with arweave or use bundler
   * @param {number} stakeAmount Amount to stake
   */
  constructor(stakeAmount = 0, direct = false) {
    super();
    this.direct = direct;
    this.stakeAmount = stakeAmount;
    this.isProposeSlashed = false;
  }

  /**
   * Main run loop
   */
  async run() {
    console.log("Running witness node with address", tools.address);
    await this.stake();

    let state, block;

    for (;;) {
      try {
        [state, block] = await this.getStateAndBlock();
      } catch (e) {
        console.error(e.message);
        continue;
      }

      if (this.direct && this.canSubmitTrafficLog(state, block))
        await this.submitTrafficLog(state, block);

      if (checkForVote(state, block)) await this.tryVote(state);

      await this.tryRankDistribute(state, block);

      if (!this.direct && checkProposeSlash(state, block))
        await this.proposeSlash(state);
    }
  }

  /**
   * Tries to vote
   * @param {*} state Current contract state data
   */
  async tryVote(state, attentionContract) {
    while (tools.totalVoted < state.votes.length - 1) {
      const id = tools.totalVoted;
      const voteId = id + 1;
      const payload = {
        voteId,
        direct: this.direct
      };
      const { message } = await tools.vote(payload, attentionContract);
      console.log(`VoteId ${voteId}: ${message}`);
    }
  }

  /**
   * checks if the vote submitted to service node is submitted on chain, if not slash the service node
   * @param {*} state Current contract state data
   */
  async proposeSlash(state, attentionContract) {
    const receipts = tools.receipt;
    const task = state.task;
    const currentTask = task.dailyProposedLogs.find(
      (dailylog) => dailylog.block === task.open
    );
    const proposedTrafficLogs = currentTask.proposedTrafficLogs;
    for (let proposedTrafficLog of proposedTrafficLogs) {
      const activeVoteReceipt = receipts.find(
        (receipt) => receipt.vote.vote.voteId === proposedTrafficLog.voteId
      );
      const votes = state.votes;
      const activeVote = votes.find(
        (vote) => vote.id === proposedTrafficLog.voteId
      );
      if (activeVoteReceipt !== undefined) {
        const voted = activeVote.voted;
        if (!voted.includes(activeVoteReceipt.senderAddress)) {
          let task = "receiptData";
          const receiptTxId = await tools.postData(activeVoteReceipt);
          await this.checkTxConfirmation(receiptTxId, task);
          const tx = await tools.proposeSlash(receiptTxId, attentionContract);
          task = "proposeSlash";
          await this.checkTxConfirmation(tx, task);
          console.log("slash is submitted");
        }
      }
    }
    this.isProposeSlashed = true;
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
    block < trafficLogs.open + OFFSET_RANK &&
    !this.isProposeSlashed
  );
}

module.exports = Witness;
