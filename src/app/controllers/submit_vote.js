const StatusCodes = require("../config/status_codes");
const { access, writeFile, readFile, appendFile } = require("fs/promises");
const { constants } = require("fs");
const { tools } = require("../../helpers");

/**
 * req.body.vote : {
 *   address : < valid arweave address with active state >,
 *   value : < boolean 'true' or 'false' vote >,
 *   vote_id : < a valid ID for a vote taking place on the KOI contract >,
 *   signature : < valid signature matching the address and value above >
 * }
 * @param {*} req express.js request
 * @param {*} res express.js result object
 * @returns
 */
async function submitVote(req, res) {
  const submission = req.body;
  if (
    !submission.vote ||
    !submission.senderAddress ||
    !submission.vote.userVote ||
    !submission.signature
  ) {
    return res.status(StatusCodes.RESPONSE_ACTION_FAILED).json({
      message: "Invalid vote format"
    });
  }

  const receipt = await checkVote(submission);

  return receipt.accepted
    ? res.json({
        message: "success",
        receipt: receipt
      })
    : res.status(StatusCodes.RESPONSE_ACTION_FAILED).json({
        message: "Invalid signature or insufficient stake."
      });
}

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

module.exports = submitVote;
