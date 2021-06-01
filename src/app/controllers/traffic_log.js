// const StatusCodes = require("../config/status_codes");
// const checkVote = require("../helpers/check_vote");
const { access, readFile } = require("fs/promises");
const { constants } = require("fs");

/**
 * req.vote : {
 *   address : < valid arweave address with active state >,
 *   value : < boolean 'true' or 'false' vote >,
 *   vote_id : < a valid ID for a vote taking place on the KOI contract >,
 *   signature : < valid signature matching the address and value above >
 * }
 * @param {*} req express.js request
 * @param {*} res express.js result object
 * @returns
 */
// async function submitTrafficLog(req, res) {
//   const submission = req.body;
//   const receipt = await checkVote(submission);

//   return receipt.accepted
//     ? res.json({
//         message: "success",
//         receipt: receipt
//       })
//     : res.status(StatusCodes.RESPONSE_ACTION_FAILED).json({
//         message: "Invalid signature or insufficient stake."
//       });
// }

/**
 * Responds with a JSON array containing votes
 * @param {*} req express.js request
 * @param {*} res express.js result object
 * @returns Array of JSON votes
 */
async function getTrafficLog(req, res) {
  try {
    const submission = req.body;
    const batch = await getVotesFile(submission.voteId);
    const logs = batch.split("\r\n").map(JSON.parse);
    return res.json(logs);
  } catch (e) {
    return res.status(StatusCodes.RESPONSE_ACTION_FAILED).json({
      message: "Unable to read or parse traffic log"
    });
  }
}

/**
 *
 * @param {*} fileId ID of vote file to read
 * @returns {string} Vote file contents in utf8
 */
async function getVotesFile(fileId) {
  const batchFileName = __dirname + "/../bundles/" + fileId;
  await access(batchFileName, constants.F_OK);
  return await readFile(batchFileName, "utf8");
}

module.exports = {
  // submitTrafficLog,
  getTrafficLog
};
