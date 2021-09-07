const { tools } = require("../../helpers");
const StatusCodes = require("../config/status_codes");
const moment = require("moment");
const kohaku = require("@_koi/kohaku");

// TODO, remove dependency on AWS
const aws = require("aws-sdk");
const multer = require("multer");
const multerS3 = require("multer-s3");
const fetch = require("node-fetch");

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

const TOP_CONTENT_COOLDOWN = 60000;
const topContentCache = {
  0: { next: 0, cache: "[]" },
  1: { next: 0, cache: "[]" },
  7: { next: 0, cache: "[]" },
  30: { next: 0, cache: "[]" },
  365: { next: 0, cache: "[]" }
};

// Setup s3 bucket
aws.config = new aws.Config();
aws.config.accessKeyId = process.env.S3_ACCESS_KEY_ID;
aws.config.secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
aws.config.region = "us-east-1";
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
 * @param {*} req express.js request
 * @param {*} res express.js result object
 */
async function getCurrentState(_req, res) {
  try {
    // Use kohaku.readContractCache to avoid JSON parsing. Should be 1000x faster than tools.getKoiiState
    const state = kohaku.readContractCache(tools.contractId);
    if (!state) throw new Error("State not available");
    res.status(200).type("application/json").send(state);
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
    let offset = 0;
    switch (req.query.frequency) {
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

    const now = Date.now();
    res
      .status(200)
      .type("application/json")
      .send(topContentCache[offset].cache);
    if (now < topContentCache[offset].next) return;
    topContentCache[offset].next = now + TOP_CONTENT_COOLDOWN;

    // filtering txIdArr based on offset
    const state = await tools.getKoiiState();
    const registerRecords = state.registeredRecord;
    let txIds = Object.keys(registerRecords).filter(
      (txId) => !CORRUPTED_NFT.includes(txId)
    );
    if (offset != 0) txIds = await filterContent(txIds, offset);
    let rewardReport;
    try {
      rewardReport = state.stateUpdate.trafficLogs.rewardReport || [];
    } catch (_e) {
      rewardReport = [];
    }

    const outputArr = txIds.map((txId) => {
      let totalViews = 0,
        totalReward = 0,
        twentyFourHrViews = 0;

      for (const report of rewardReport) {
        const logSummary = report.logsSummary;
        if (txId in logSummary) {
          totalViews += logSummary[txId];
          totalReward += logSummary[txId] * report.rewardPerAttention;
        }
      }

      const lastSummary = rewardReport[rewardReport.length - 1].logsSummary;
      if (txId in lastSummary) twentyFourHrViews = lastSummary[txId];

      return {
        [txId]: {
          owner: registerRecords[txId],
          txIdContent: txId,
          totalViews,
          totalReward,
          twentyFourHrViews
        }
      };
    });

    outputArr.sort(
      (a, b) =>
        b[Object.keys(b)[0]].totalViews - a[Object.keys(a)[0]].totalViews
    );
    topContentCache[offset].cache = JSON.stringify(outputArr);
  } catch (e) {
    console.error(e);
    res.status(500).send({ error: "ERROR: " + e });
  }
}

/**
 *
 * @param {*} nftIdArr
 * @param {*} days
 * @returns
 */
async function filterContent(nftIdArr, days) {
  const nftViewProms = nftIdArr.map((nftId) => tools.redisGetAsync(nftId));
  const now = moment().unix();
  const nftViews = (await Promise.all(nftViewProms)).map(
    (nftViewStr, index) => {
      if (!nftViewStr)
        return {
          txIdContent: nftIdArr[index],
          createdAt: now
        };
      const nftView = JSON.parse(nftViewStr);
      nftView.createdAt = nftView.createdAt ? parseInt(nftView.createdAt) : now;
      return nftView;
    }
  );

  const limitTimestamp = moment().subtract(days, "day").unix();
  for (let i = nftViews.length - 1; i > 0; --i)
    if (nftViews[i].createdAt < limitTimestamp)
      return nftIdArr.slice(i, nftIdArr.length);
  return nftIdArr;
}

/**
 *
 * @param {*} req
 * @param {*} res
 */
async function getNFTState(req, res) {
  try {
    const state = await tools.getKoiiState();
    const tranxId = req.query.tranxId;
    const view = await tools.computeContentView(tranxId, state);
    if (view) {
      view.timestamp = moment().unix() * 1000;
      if (view.tx) delete view.tx;
      tools.redisSetAsync(tranxId, JSON.stringify(view));
    }
    if (!res.headersSent) res.status(200).send(view);
  } catch (e) {
    console.error(e);
    res.status(500).send({ error: "ERROR: " + e });
  }
}

/**
 *
 * @param {*} req
 * @param {*} res
 */
async function getTotalKOIIEarned(req, res) {
  try {
    let totalKOIIEarned = 0;
    let data = await fetch(
      "http://localhost:" +
        process.env.SERVER_PORT +
        "/state/top-content-predicted?frequency=all"
    );
    data = await data.json();
    for (const nftState of data)
      totalKOIIEarned += Object.values(nftState)[0].totalReward;
    return res.status(200).send({ totalKOIIEarned });
  } catch (e) {
    console.error("Error", e);
    res.status(500).send("Error occurred while fetching totalKOIIEarned");
  }
}

/**
 *
 * @param {*} req
 * @param {*} res
 */
async function getTotalNFTViews(req, res) {
  try {
    let totalNFTViews = 0;
    let data = await fetch(
      "http://localhost:" +
        process.env.SERVER_PORT +
        "/state/top-content-predicted?frequency=all"
    );
    data = await data.json();
    for (const nftState of data)
      totalNFTViews += Object.values(nftState)[0].totalViews;
    return res.status(200).send({ totalNFTViews });
  } catch (e) {
    console.error("Error", e);
    res.status(500).send("Error occurred while fetching totalNFTViews");
  }
}

/**
 *
 * @param {*} req
 * @param {*} res
 */
async function handleNFTUpload(req, res) {
  try {
    singleUpload(req, res, async (err) => {
      if (err) {
        console.error(err);
        return res.json(err);
      }
      req.body = JSON.parse(req.body.data);
      const txId = req.body.registerDataParams.id;
      delete req.body.registerDataParams;
      req.body.fileLocation = req.file.location;
      await tools.redisSetAsync(txId, JSON.stringify(req.body));
      res.json({ url: req.file.location });
    });
  } catch (err) {
    console.error(err);
    res.sendStatus(StatusCodes.RESPONSE_IMAGE_ERROR);
  }
}

module.exports = {
  getCurrentState,
  getTopContentPredicted,
  getNFTState,
  handleNFTUpload,
  getTotalNFTViews,
  getTotalKOIIEarned
};
