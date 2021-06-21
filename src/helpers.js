const OFFSET_SUBMIT_END = 300;
const OFFSET_BATCH_SUBMIT = 470;
const OFFSET_PROPOSE_SLASH = 570;
const OFFSET_RANK = 645;
const URL_GATEWAY_LOGS = "https://gateway-n2.amplify.host/logs";

const MS_TO_MIN = 60000;

// Tools singleton
const tools = new (require("@_koi/sdk/node").Node)(
  process.env.TRUSTED_SERVICE_URL
);

// Arweave singleton
const arweave = require("arweave").init({
  host: "arweave.dev",
  protocol: "https",
  port: 443,
  timeout: 20000, // Network request timeouts in milliseconds
  logging: false // Enable network request logging
});

/**
 * Common node functions for witness and service
 */
class Node {
  constructor() {
    this.isLogsSubmitted = false;
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
   *
   * @param {*} state
   * @param {*} block
   * @returns
   */
  canSubmitTrafficLog(state, block) {
    // Check if we're an indirect witness
    if (this.direct === false) return false;

    // Check if we're in the time frame, if not reset isLogsSubmitted and return false
    const trafficLogs = state.stateUpdate.trafficLogs;
    if (
      block < trafficLogs.open ||
      trafficLogs.open + OFFSET_SUBMIT_END < block
    ) {
      this.isLogsSubmitted = false;
      return false;
    }

    // We haven't submitted yet
    if (this.isLogsSubmitted) return false;

    // Check that our log isn't on the state yet and that our gateway hasn't been submitted yet
    const currentTrafficLogs =
      state.stateUpdate.trafficLogs.dailyTrafficLog.find(
        (log) => log.block === trafficLogs.open
      );
    const proposedLogs = currentTrafficLogs.proposedLogs;
    const matchingLog = proposedLogs.find(
      (log) => log.owner === tools.address || log.gateWayId === URL_GATEWAY_LOGS
    );

    return matchingLog === undefined;
  }

  /**
   *
   */
  async submitTrafficLog() {
    var task = "submitting traffic log";
    let arg = {
      gateWayUrl: URL_GATEWAY_LOGS,
      stakeAmount: 2
    };

    let tx = await tools.submitTrafficLog(arg);
    await this.checkTxConfirmation(tx, task);
    console.log("Traffic log submission confirmed");
    this.isLogsSubmitted = true;
  }

  /**
   * Checks wether proposal is ranked or not
   * @param {*} state Current contract state data
   * @param {number} block Block height
   * @returns {boolean} Wether we can rank
   */
  canRankProposal(state, block) {
    // Check if we're in the time frame, if not reset isRanked and return false
    const trafficLogs = state.stateUpdate.trafficLogs;
    if (block < trafficLogs.open + OFFSET_RANK || trafficLogs.close < block) {
      this.isRanked = false;
      return false;
    }

    // If we've ranked, return false
    if (this.isRanked) return false;

    // If our rank isn't on the state yet

    if (!trafficLogs.dailyTrafficLog.length) return false;
    const currentTrafficLogs = trafficLogs.dailyTrafficLog.find(
      (trafficLog) => trafficLog.block === trafficLogs.open
    );
    return !currentTrafficLogs.isRanked;
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
    // Check if it's time to distribute, if not reset isDistributed and return false
    const trafficLogs = state.stateUpdate.trafficLogs;
    if (block < trafficLogs.close) {
      this.isDistributed = false;
      return false;
    }

    // If we've locally distributed, return false
    if (this.isDistributed) return false;

    // If our distribution isn't on the state yet

    if (!trafficLogs.dailyTrafficLog.length) return false;
    const currentTrafficLogs = trafficLogs.dailyTrafficLog.find(
      (trafficLog) => trafficLog.block === trafficLogs.open
    );
    return !currentTrafficLogs.isDistributed;
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
    const start = new Date().getTime() - 1;
    const update_period = MS_TO_MIN * 10;
    let next_update = start;
    for (;;) {
      const now = new Date().getTime();
      if (now > next_update) {
        next_update = now + update_period;
        const elapsed_mins = Math.round((now - start) / MS_TO_MIN);
        process.stdout.write(
          `\n${elapsed_mins}m waiting for "${task}" TX to be mined`
        );
      } else process.stdout.write(".");
      try {
        await tools.getTransaction(txId);
        const elapsed_mins = Math.round((now - start) / MS_TO_MIN);
        console.log(`\nTransaction found in ${elapsed_mins}m`);
        break;
      } catch (_err) {
        // Silently catch error, might be dangerous
      }
    }
  }
}

module.exports = {
  OFFSET_BATCH_SUBMIT,
  OFFSET_RANK,
  OFFSET_PROPOSE_SLASH,
  tools,
  arweave,
  Node
};
