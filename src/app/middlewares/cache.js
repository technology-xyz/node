const { tools } = require("../../helpers");
const moment = require("moment");

module.exports = async (req, res, next) => {
  // Checking if redis cache has corresponding data Else passing flow to the corresponding controller
  // Accepts nocache @Get param to bypass cache
  try {
    if (
      tools.redisClient &&
      !req.query.nocache &&
      req.originalUrl.toLowerCase().includes("state/nft")
    ) {
      let content = await tools.redisGetAsync(req.query.tranxId);
      content = JSON.parse(content);
      // Checking if content exist but is not from predictedState
      if (content && content.owner && !content.fileLocation) {
        res.status(200).send(content);
        if (
          moment().subtract(15, "minutes").isBefore(moment(content.timestamp))
        )
          return;
      }
    }
    next();
  } catch (e) {
    console.log(e);
    next();
  }
};
