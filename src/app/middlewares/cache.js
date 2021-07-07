const { tools } = require("../../helpers");
const moment = require("moment");

module.exports = async (req, res, next) => {
  /* Checking if redis cache has corrsponding data Else passing flow to the corresponding controller*/
  /* Accepts nocache @Get param to bypass cache*/
  try {
    if (!tools.redisClient && req.query.nocache) {
      next();
      return;
    }

    if (!req.originalUrl.toLowerCase().includes("state/nft")) {
      console.log("ROUTE DOESN'T MATCH");
      next();
      return;
    }

    // Checking if content exist but is not from predictedState
    const tranxId = req.query.tranxId;
    const contentStr = await tools.redisGetAsync(tranxId);
    const content = JSON.parse(contentStr);
    if (content && content.owner && !content.fileLocation) {
      if (moment().subtract(15, "minutes").isAfter(moment(content.timestamp)))
        res.status(200).send(content);
      else return res.status(200).send(content);
    } else console.error("NFT not found in cache");
    next();
  } catch (e) {
    console.error(e);
    next();
  }
};
