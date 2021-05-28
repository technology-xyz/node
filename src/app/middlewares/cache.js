const tools = require("../../tools");
const redisClient = tools.redisClient;
const { promisify } = require("util");
const redisGetAsync = promisify(redisClient.get).bind(redisClient);

module.exports = async (req, res, next) => {
  /* Checking if redis cache has corrsponding data Else passing flow to the corresponding controller*/
  /* Accepts nocache @Get param to bypass cache*/
  try {
    if (redisClient && !req.query.nocache) {
      if (req.originalUrl.toLowerCase().includes("state/current")) {
        let currentState = await redisGetAsync("currentState");
        if (currentState) {
          currentState = JSON.parse(currentState);
          return res.status(200).send(currentState);
        }
      } else if (
        req.originalUrl.toLowerCase().includes("state/gettopcontent")
      ) {
        let topContent = await redisGetAsync("topContent");
        topContent = JSON.parse(topContent);
        if (topContent) {
          return res.status(200).send(topContent);
        }
      }
    }
    next();
  } catch (e) {
    console.log(e);
    next();
  }
};
