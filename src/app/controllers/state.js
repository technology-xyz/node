const { tools } = require("../../helpers");
const StatusCodes = require("../config/status_codes");
const { promisify } = require("util");
const moment = require("moment");

// TODO, remove dependency on AWS
const aws = require("aws-sdk");
const multer = require("multer");
const multerS3 = require("multer-s3");

const CORRUPTED_NFT = [
  "Y4txuRg9l1NXRSDZ7FDtZQiTl7Zv7RQ9impMzoReGDU",
  "dyLgErL7IJfSH2fU9mWBhfSdb5HOUnU2lOPq5y1twho",
  "54ExppB1akUYllW4BZhmYx679eMtiA6tSTsrJ8IDCOo",
  "EpbbtviT8nqC3aCflyfM5sWf0lAq6YsFW6K48T1tAbU",
  "oOyREnD872TBaOnXDMNG5CM3QYYpqJTNuSe4sL2sCfc",
  "YYSb3A_VYwgs1l_MEXnhNvKmdIwTBQ2GYBpJa2qNOU0",
  "O7whFDUayKrP4bKdKAwYRWw1qwJ4-5alQWVoSAI1i_4",
  "UI2V5Yyd4dW-1KdJnpVZDNFZ3l6reZ4nrKKg_YCN_Wo",
  "X63sVIgKjL7lf3CBCDRjUrkXEkm8QulJw1mVpc6LHKc",
  "kpgshM3-SZbK2ChO3lJIPQ84hS90_FnJBNsSr9n3QHA",
  "A268M4BDGF6y-wA7MZ-1G5QAyfj8Hufcop4fVHu0SFc",
  "s52dZCUGSTF2Sl3QF2f1Egyv-BCSrqulkMk3fXT9EOw",
  "QIrGq8VqcqbGEV2QHQOyS7TjMm_Xpa_5mww3edn0TUs",
  "ZTZDEPuAfh2Nsv9Ad46zJ4k6coHbZcmi7BcJgt126wU"
];

// Setup redis
const redisClient = tools.redisClient;
const redisSetAsync = promisify(redisClient.set).bind(redisClient);
const redisGetAsync = promisify(redisClient.get).bind(redisClient);

// Setup s3 bucket
const s3 = new aws.S3();
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: "koi-nft-storage",
    acl: "public-read",
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req, file, cb) {
      let ext = file.originalname.substring(
        file.originalname.lastIndexOf("."),
        file.originalname.length
      );
      cb(null, Date.now().toString() + ext);
    }
  })
});
const singleUpload = upload.single("file");

/**
 *
 * @param {*} _req
 * @param {*} res
 */
async function getCurrentState(_req, res) {
  try {
    const currentState = await tools.getContractState();
    console.log("RECEIVED CURRENT STATE", currentState);
    if (currentState) {
      res.status(200).send(currentState);
      if (redisSetAsync) {
        await redisSetAsync(
          "currentState",
          JSON.stringify(currentState),
          "EX",
          5 * 60
        );
      }
    } else {
      res.status(500).send({ error: "state not available" });
    }
  } catch (e) {
    console.log(e);
    res.status(500).send({ error: "ERROR: " + e });
  }
}

/**
 *
 * @param {*} _req express.js request
 * @param {*} res express.js result object
 */
async function getCurrentStateCached(_req, res) {
  try {
    const currentStateCached = await redisGetAsync("currentStateCached");
    res.status(200).send(currentStateCached || []);
  } catch (e) {
    console.log(e);
    res.status(500).send({ error: "ERROR: " + e });
  }
}

/**
 *
 * @param {*} req express.js request
 * @param {*} res express.js result object
 */
async function getCurrentStatePredicted(req, res) {
  try {
    const currentStateCached = await redisGetAsync("TempPredictedState");
    res.status(200).send(currentStateCached || []);
  } catch (e) {
    console.log(e);
    res.status(500).send({ error: "ERROR: " + e });
  }
}

/**
 *
 * @param {*} req express.js request
 * @param {*} res express.js result object
 */
async function getTopContentPredicted(req, res) {
  try {
    const state = await tools._readContract();
    const registerRecords = state.registeredRecord;
    let txIds = Object.keys(registerRecords).filter(
      (txId) => !CORRUPTED_NFT.includes(txId)
    );
    const frequency = req.query.frequency;
    let offset = 0;
    switch (frequency) {
      case "24h":
        offset = 1;
        break;
      case "1w":
        offset = 7;
        break;
      case "1m":
        offset = 30;
        break;
      case "1y":
        offset = 365;
    }

    // filtering txIdArr based on offset
    let outputArr = [];
    if (offset != 0) txIds = await filterContent(txIds, offset);
    let rewardReport;
    try {
      rewardReport = state.stateUpdate.trafficLogs.rewardReport || [];
    } catch (_e) {
      rewardReport = [];
    }

    for (let i = 0; i < txIds.length; i++) {
      const contentTxId = txIds[i];
      const contentViews = {
        totalViews: 0,
        totalReward: 0,
        twentyFourHrViews: 0,
        txIdContent: contentTxId
      };

      for (let j = 0; j < rewardReport.length; j++) {
        const ele = rewardReport[i];
        const logSummary = ele.logsSummary;

        for (const txId in logSummary) {
          if (txId == contentTxId) {
            if (rewardReport.indexOf(ele) == rewardReport.length - 1) {
              contentViews.twentyFourHrViews = logSummary[contentTxId];
            }

            const rewardPerAttention = ele.rewardPerAttention;
            contentViews.totalViews += logSummary[contentTxId];
            const rewardPerLog = logSummary[contentTxId] * rewardPerAttention;
            contentViews.totalReward += rewardPerLog;
          }
        }
      }

      outputArr.push({
        [contentTxId]: {
          owner: registerRecords[contentTxId],
          ...contentViews
        }
      });
    }
    outputArr = outputArr.sort((a, b) => {
      if (a[Object.keys(a)[0]].totalViews < b[Object.keys(b)[0]].totalViews)
        return 1;
      if (a[Object.keys(a)[0]].totalViews > b[Object.keys(b)[0]].totalViews)
        return -1;
      return 0;
    });
    res.status(200).send(outputArr);
  } catch (e) {
    console.log(e);
    res.status(500).send({ error: "ERROR: " + e });
  }
}

/**
 *
 * @param {*} req
 * @param {*} res
 */
async function getNFTState(req, res) {
  try {
    const tranxId = req.query.tranxId;
    const state = await tools._readContract();
    const content = await tools.contentView(tranxId, state);
    if (content)
      redisSetAsync(tranxId, JSON.stringify(content), "EX", 60 * 60 * 6);
    res.status(200).send(content);
  } catch (e) {
    console.log(e);
    res.status(500).send({ error: "ERROR: " + e });
  }
}

async function handleNFTUpload(req, res) {
  try {
    singleUpload(req, res, async (err) => {
      if (err) {
        console.log(err);
        return res.json(err);
      }
      req.body = JSON.parse(req.body.data);
      let pendingStateArray = await redisGetAsync("pendingStateArray");
      if (!pendingStateArray) pendingStateArray = [];
      else pendingStateArray = JSON.parse(pendingStateArray);
      pendingStateArray.push({
        status: "pending",
        txId: req.body.registerDataParams.id,
        signedTx: req.body.tx,
        owner: req.body.registerDataParams.ownerAddress
        // dryRunState:response.state,
      });
      await redisSetAsync(
        "pendingStateArray",
        JSON.stringify(pendingStateArray)
      );
      const txId = req.body.registerDataParams.id;
      delete req.body.registerDataParams;
      req.body.fileLocation = req.file.location;
      await redisSetAsync(txId, JSON.stringify(req.body));
      await tools.loadRedisClient();
      await tools.recalculatePredictedState(tools.wallet);
      res.json({ url: req.file.location });
    });
  } catch (err) {
    console.log(err);
    res.sendStatus(StatusCodes.RESPONSE_IMAGE_ERROR);
  }
}

/**
 *
 * @param {*} paramOutputArr
 * @param {*} days
 * @returns
 */
async function filterContent(paramOutputArr, days) {
  console.log(days, "RECEIVED TOTAL", paramOutputArr.length);
  try {
    const outputArr = paramOutputArr.map((e) => {
      return redisGetAsync(e);
    });
    let populatedOutputArr = await Promise.all(outputArr);
    populatedOutputArr = populatedOutputArr.map((e, index) => {
      if (!e) {
        console.log("NOT", e);
        const transaction = paramOutputArr[index];
        return {
          txIdContent: Object.keys(transaction)[0],
          createdAt: moment().unix()
        };
      }
      const z = JSON.parse(e);
      z.createdAt = e
        ? moment(parseInt(z.createdAt) * 1000).unix()
        : moment().unix();
      return z;
    });
    let index = 0;
    for (let i = populatedOutputArr.length - 1; i >= 0; i--) {
      if (!populatedOutputArr[i] || !populatedOutputArr[i].createdAt) continue;
      if (
        populatedOutputArr[i].createdAt < moment().subtract(days, "day").unix()
      ) {
        index = i;
        break;
      }
    }
    paramOutputArr = paramOutputArr.slice(index, paramOutputArr.length);
    console.log("RETURNED TOTAL", paramOutputArr.length);

    return paramOutputArr;
  } catch (e) {
    console.log(e);
  }
}

/**
 * Responds with a cache of the projected future state
 *   including all pending updates, from all nodes
 * @param {*} req express.js request
 * @param {*} res express.js result object
 */
// async function getProjectedState(req, res) {
//   console.log("current state", cache.state);
//   await updateStateCache();
//   if (cache.state) {
//     res.status(200).send(cache.state);
//   } else res.status(500).send({ error: "state not available" });
// }

/**
 * Responds with a cache of pending states
 * @param {*} req express.js request
 * @param {*} res express.js result object
 */
// async function getPendingState(req, res) {
//   console.log("current state");
// }

module.exports = {
  getCurrentState,
  getCurrentStateCached,
  getCurrentStatePredicted,
  getTopContentPredicted,
  getNFTState,
  handleNFTUpload
};
