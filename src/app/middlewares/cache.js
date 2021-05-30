const { tools } = require("../../helpers");
const redisClient = tools.redisClient;
const { promisify } = require("util");
const redisGetAsync = promisify(redisClient.get).bind(redisClient);

module.exports = async (req, res, next) => {
  if (req.originalUrl.toLowerCase().includes("state/current")) {
    try {
      let currentState = await redisGetAsync("currentState");
      if (currentState) return res.status(200).send(JSON.parse(currentState));
    } catch (e) {
      console.log(e);
    }
  }
  next();
};
