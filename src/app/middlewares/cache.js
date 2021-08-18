const { tools } = require("../../helpers");
const redisClient = tools.redisClient
const {promisify} = require('util');
const redisGetAsync = promisify(redisClient.get).bind(redisClient);
const moment =require("moment")

module.exports = async (req, res, next) => {
  /* Checking if redis cache has corrsponding data Else passing flow to the corresponding controller*/
  /* Accepts nocache @Get param to bypass cache*/
  try {
    if (redisClient && !req.query.nocache) {
      if (req.originalUrl.toLowerCase().includes('state/nft')) {
        let tranxId=req.query.tranxId
        let content = await redisGetAsync(tranxId);
        content=JSON.parse(content)
        // Checking if content exist but is not from predictedState
        if (content && content.owner && !content.fileLocation) {
          if(content?moment().subtract(15,"minutes").isAfter(moment(content.timestamp)):false){
            res.status(200).send(content)
          }
          else{
            return res.status(200).send(content);
          }
        }else{
          console.log("CONTENT NOT FOUND")
        }
      }
      else{
        console.log("ROUTE DOESN'T MATCH")  
      }
    }
    next()
  } catch (e) {
    console.log(e);
    next();
  }
};