const OFFSET_SUBMIT_END = 300;
const OFFSET_BATCH_SUBMIT = 470;
const OFFSET_PROPOSE_SLASH = 570;
const OFFSET_RANK = 645;

const MS_TO_MIN = 60000;
const TIMEOUT_TX = 30 * MS_TO_MIN;

const ARWEAVE_RATE_LIMIT = 60000; // Reduce arweave load

// Tools singleton
const koiSdk = require("@_koi/sdk/node");
const tools = new koiSdk.Node(process.env.TRUSTED_SERVICE_URL);

// Arweave singleton
const arweave = require("@_koi/sdk/common").arweave;

/**
 * Common node functions for witness and service
 */
class Node {
  constructor() {
    this.isLogsSubmitted = false;
    this.isRanked = false;
    this.isDistributed = false;
    this.stakeAmount = 0;
    this.lastBlock = 0;
    this.lastLogClose = 0;
  }

  /**
   * Stakes and waits for stake to appear on chain
   * @returns {bool} Whether stake was successful or not
   */
  async stake() {
    if (this.stakeAmount > 0) {
      console.log("Staking", this.stakeAmount);
      const txId = await tools.stake(this.stakeAmount);
      return await this.checkTxConfirmation(txId, "staking");
    }
  }

  /**
   * Gets the state and block and resets trackers if logs updated
   * @returns {any, number} Tuple containing state and block
   */
  async getStateAndBlock() {
    const state = await tools.getContractState();
    let block = await tools.getBlockHeight();
    if (block < this.lastBlock) block = this.lastBlock;

    const logClose = state.stateUpdate.trafficLogs.close;
    if (logClose > this.lastLogClose) {
      if (this.lastLogClose !== 0) {
        console.log("Logs updated, resetting trackers");
        this.isDistributed = false;
        this.isLogsSubmitted = false;
        this.isRanked = false;
      }

      this.lastLogClose = logClose;
    }

    if (block > this.lastBlock)
      console.log(
        block,
        "Searching for a task, distribution in",
        logClose - block,
        "blocks"
      );
    this.lastBlock = block;
    await rateLimit();
    return [state, block];
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

    const trafficLogs = state.stateUpdate.trafficLogs;
    if (
      block >= trafficLogs.open + OFFSET_SUBMIT_END || // block too late or
      this.isLogsSubmitted // logs already submitted
    )
      return false;

    // Check that our log isn't on the state yet and that our gateway hasn't been submitted yet
    const currentTrafficLogs =
      state.stateUpdate.trafficLogs.dailyTrafficLog.find(
        (log) => log.block === trafficLogs.open
      );
    const proposedLogs = currentTrafficLogs.proposedLogs;
    const matchingLog = proposedLogs.find(
      (log) =>
        log.owner === tools.address || log.gateWayId === koiSdk.URL_GATEWAY_LOGS
    );
    this.isLogsSubmitted = matchingLog !== undefined;
    return !this.isLogsSubmitted;
  }

  /**
   *
   */
  async submitTrafficLog() {
    var task = "submitting traffic log";
    let arg = {
      gateWayUrl: koiSdk.URL_GATEWAY_LOGS,
      stakeAmount: 2
    };

    let tx = await tools.submitTrafficLog(arg);
    if (await this.checkTxConfirmation(tx, task)) {
      this.isLogsSubmitted = true;
      console.log("Logs submitted");
    }
  }

  /**
   * Checks wether proposal is ranked or not
   * @param {*} state Current contract state data
   * @param {number} block Block height
   * @returns {boolean} Wether we can rank
   */
  canRankProposal(state, block) {
    const trafficLogs = state.stateUpdate.trafficLogs;
    if (
      block < trafficLogs.open + OFFSET_RANK || // if too early to rank or
      trafficLogs.close < block || // too late to rank or
      this.isRanked // already ranked
    )
      return false;

    // If our rank isn't on the state yet
    if (!trafficLogs.dailyTrafficLog.length) return false;
    const currentTrafficLogs = trafficLogs.dailyTrafficLog.find(
      (trafficLog) => trafficLog.block === trafficLogs.open
    );
    this.isRanked = currentTrafficLogs.isRanked;
    return !currentTrafficLogs.isRanked;
  }

  /**
   *
   */
  async rankProposal() {
    const task = "ranking reward";
    const tx = await tools.rankProposal();
    if (await this.checkTxConfirmation(tx, task)) {
      this.isRanked = true;
      console.log("Ranked");
    }
  }

  /**
   *
   * @param {*} state Current contract state data
   * @param {number} block Block height
   * @returns {boolean} Wether we can distribute
   */
  canDistribute(state, block) {
    const trafficLogs = state.stateUpdate.trafficLogs;
    if (
      block < trafficLogs.close || // not time to distribute or
      this.isDistributed || // we've already distributed or
      !trafficLogs.dailyTrafficLog.length // daily traffic log is empty
    )
      return false;

    // If our distribution isn't on the state yet
    const currentTrafficLogs = trafficLogs.dailyTrafficLog.find(
      (trafficLog) => trafficLog.block === trafficLogs.open
    );
    this.isDistributed = currentTrafficLogs.isDistributed;
    return !this.isDistributed;
  }

  /**
   *
   */
  async distribute() {
    const task = "distributing reward";
    const tx = await tools.distributeDailyRewards();
    if (await this.checkTxConfirmation(tx, task)) {
      this.isDistributed = true;
      console.log("Distributed");
    }
  }

  /**
   *
   * @param {string} txId // Transaction ID
   * @param {*} task
   * @returns {bool} Whether transaction was found (true) or timedout (false)
   */
  async checkTxConfirmation(txId, task) {
    const start = new Date().getTime() - 1;
    const update_period = MS_TO_MIN * 5;
    const timeout = start + TIMEOUT_TX;
    let next_update = start + update_period;
    console.log(`Waiting for "${task}" TX to be mined`);
    for (;;) {
      const now = new Date().getTime();
      const elapsed_mins = Math.round((now - start) / MS_TO_MIN);
      if (now > timeout) {
        console.log(`${task}" timed out after waiting ${elapsed_mins}m`);
        return false;
      }
      if (now > next_update) {
        next_update = now + update_period;
        console.log(`${elapsed_mins}m waiting for "${task}" TX to be mined `);
      }
      try {
        await tools.getTransaction(txId);
        console.log(`Transaction found in ${elapsed_mins}m`);
        return true;
      } catch (_err) {
        // Silently catch error, might be dangerous
      }
      await rateLimit();
    }
  }
}

/**
 * Awaitable rate limit
 * @returns
 */
function rateLimit() {
  return new Promise((resolve) => setTimeout(resolve, ARWEAVE_RATE_LIMIT));
}

module.exports = {
  OFFSET_BATCH_SUBMIT,
  OFFSET_RANK,
  OFFSET_PROPOSE_SLASH,
  tools,
  arweave,
  Node
};
