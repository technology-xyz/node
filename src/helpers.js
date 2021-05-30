// Tools singleton
const tools = new (require("@_koi/sdk/node").Node)();

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
 */
async function rankProposal() {
  const task = "ranking reward";
  const tx = await tools.rankProposal();
  await checkTxConfirmation(tx, task);
}

module.exports = {
  tools,
  checkTxConfirmation,
  rankProposal
};
