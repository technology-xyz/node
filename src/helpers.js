// Tools singleton
const tools = new (require("@_koi/sdk/node").Node)();

const DURATION_PROPOSAL = 75;

/**
 * Common node functions for witness and service
 */
class Node {
  constructor() {
    this.isRanked = false;
    this.isDistributed = false;
  }

  /**
   * Tries to rank and distribute
   * @param {*} contractState Current contract state data
   * @param {*} block Block height
   */
  async tryRankDistribute(contractState, block) {
    if (this.canRankProposal(contractState, block)) await this.rankProposal();

    if (this.canDistribute(contractState, block)) await this.distribute();
  }

  /**
   * Checks wether proposal is ranked or not
   * @param {*} state Current contract state data
   * @param {number} block Block height
   * @returns {boolean} Wether we can rank
   */
  canRankProposal(state, block) {
    const trafficLogs = state.stateUpdate.trafficLogs;
    if (!trafficLogs.dailyTrafficLog.length) return false;
    const currentTrafficLogs = trafficLogs.dailyTrafficLog.find(
      (trafficLog) => trafficLog.block === trafficLogs.open
    );

    if (currentTrafficLogs.isRanked || this.isRanked) return false;
    return (
      trafficLogs.close - DURATION_PROPOSAL < block && block < trafficLogs.close
    );
  }

  /**
   *
   */
  async rankProposal() {
    const task = "ranking reward";
    const tx = await tools.rankProposal();
    await this.checkTxConfirmation(tx, task);
    this.isRanked = true;
  }

  /**
   *
   * @param {*} state Current contract state data
   * @param {number} block Block height
   * @returns {boolean} Wether we can distribute
   */
  canDistribute(state, block) {
    const trafficLogs = state.stateUpdate.trafficLogs;
    if (!trafficLogs.dailyTrafficLog.length) return false;
    const currentTrafficLogs = trafficLogs.dailyTrafficLog.find(
      (trafficLog) => trafficLog.block === trafficLogs.open
    );

    let isDistributed = currentTrafficLogs.isDistributed || this.isDistributed;
    if (block > trafficLogs.close && !isDistributed) {
      this.isRanked = false;
      return true;
    } else if (block < trafficLogs.close) this.isDistributed = false;

    return false;
  }

  /**
   *
   */
  async distribute() {
    const task = "distributing reward";
    const tx = await tools.distributeDailyRewards();
    await this.checkTxConfirmation(tx, task);
    this.isDistributed = true;
  }

  /**
   *
   * @param {string} txId // Transaction ID
   * @param {*} task
   */
  async checkTxConfirmation(txId, task) {
    let num = 0;
    for (;;) {
      console.log(
        "tx is being added to blockchain ......" + ++num + "% " + task
      );
      try {
        await tools.getTransaction(txId);
        console.log("transaction found");
        break;
      } catch (_err) {
        // Silently catch error, might be dangerous
      }
    }
  }
}

module.exports = {
  tools,
  Node
};
