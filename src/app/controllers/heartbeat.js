module.exports = (_req, res) => {
  return res
    .status(200)
    .send(
      '<body style="background:black"><img src="https://media.giphy.com/media/OMD2Ca7SN87gQ/giphy.gif" style="width:100vw;height:auto"></img></body>'
    );
};
