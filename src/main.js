const { getCacheData, ADDR_BUNDLER } = require("koi_tools/common");
const { Node } = require("koi_tools/node");

const ADDR_BUNDLER_CURRENT = ADDR_BUNDLER + "/state/current"; // TODO replace this with common ADDR_BUNDLER_CURRENT import

/**
 * Main entry point point
 * wallet // Path to wallet
 * qty    // Amount to stake
 * direct // ?
 * @param {{
 *   wallet: string,
 *   qty: number,
 *   direct: any
 *  }} arg Node initialization params
 */
function runNode(arg) {
  const tools = new Node();
  let isRanked = false,
    isDistributed = false;

  /**
   * Starts the run loop
   */
  async function run() {
    console.log("entered run node with");
    await tools.nodeLoadWallet(arg.wallet);

    console.log(tools.address);
    for (;;) await work();
  }

  /**
   * Run loop
   */
  async function work() {
    const stateData = (await getCacheData(ADDR_BUNDLER_CURRENT)).data;
    const block = await tools.getBlockHeight();
    console.log(tools.address, "is looking for a task to join");

    if (checkForVote(stateData, block)) await searchVote(stateData);

    // if (checkProposeSlash(stateData, block)) await tools.proposeSlash();

    if (isProposalRanked(stateData, block)) await rankProposal();

    if (isRewardDistributed(stateData, block)) await distribute();
  }

  /**
   * Searches for vote
   * @param {*} state Current contract state data
   */
  async function searchVote(state) {
    while (tools.totalVoted < state.votes.length - 1) {
      const id = tools.totalVoted;
      let voteId = id + 1;
      const arg = {
        voteId,
        direct: arg.direct
      };
      console.log(voteId);
      const { message } = await tools.vote(arg);

      console.log(`for ${voteId} VoteId..........,`, message);
    }
  }

  /**
   *
   * @param {*} stateData
   * @param {number} block Current block height
   * @returns {boolean} If can slash
   */
  // function checkProposeSlash(stateData, block) {
  //   const trafficLogs = stateData.stateUpdate.trafficLogs;
  //   return block > trafficLogs.close - 150 && block < trafficLogs.close - 75;
  // }

  /**
   * Checks wether proposal is ranked or not
   * @param {*} state Current contract state data
   * @param {number} block Block height
   * @returns {boolean} Whether the proposal is ranked or not
   */
  function isProposalRanked(state, block) {
    const trafficLogs = state.stateUpdate.trafficLogs;
    if (!trafficLogs.dailyTrafficLog.length) return false;
    const currentTrafficLogs = trafficLogs.dailyTrafficLog.find(
      (trafficLog) => trafficLog.block === trafficLogs.open
    );

    console.log(currentTrafficLogs);
    if (currentTrafficLogs.isRanked || isRanked) return false;

    return block > trafficLogs.close - 75 && block < trafficLogs.close;
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
   * @param {string} txId // Transaction ID
   * @param {*} task
   */
  async function checkTxConfirmation(txId, task) {
    let num = 0;
    for (;;) {
      console.log(
        "tx is being added to blockchain ......" + ++num + "% " + task
      );
      try {
        await tools.getTransaction(txId);
        console.log("transaction found");
        break;
      } catch (err) {
        console.log(err.type);
      }
    }
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

  run().then(() => console.log("Node terminated"));
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

module.exports = runNode;
