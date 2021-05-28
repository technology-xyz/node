const { access, writeFile, readFile, appendFile } = require("fs/promises");
const { constants } = require("fs");
const tools = require("../../tools");

/**
 * Check the vote's signature
 * @param {*} payload
 * @returns
 */
async function checkVote(payload) {
  // add && tools.verifyStake(vote.address)
  if (!(await tools.verifySignature(payload))) return { accepted: false };
  const receipt = await appendToBatch(payload); // Since it's valid, append it to the vote list

  // NOTE: we piggy back the receipt on this function because
  //   this ensures that the receipt cannot be returned if the
  //   item was not added to the vote bundle
  receipt.accepted = true;
  return receipt;
}

async function appendToBatch(submission) {
  const batchFileName = __dirname + "/../bundles/" + submission.vote.voteId;

  try {
    await access(batchFileName, constants.F_OK);
  } catch {
    // If file doesn't exist
    // Check for duplicate otherwise append file
    const data = await readFile(batchFileName);
    if (data.includes(submission.senderAddress)) return "duplicate";
    await appendFile(batchFileName, "\r\n" + JSON.stringify(submission));
    return generateReceipt(submission);
  }

  // If file does exist
  // Write to file and generate receipt if no error
  await writeFile(batchFileName, JSON.stringify(submission));
  return generateReceipt(submission);
}

/**
 * check that the signature on the payload matches the address of the sender (inside the vote payload)
 * @param {*} payload
 * @returns
 */
async function generateReceipt(payload) {
  const blockHeight = await tools.getBlockHeight();
  return await tools.signPayload({
    vote: payload,
    blockHeight: blockHeight
  });
}

module.exports = checkVote;
