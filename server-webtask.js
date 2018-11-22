var Webtask = require('webtask-tools');

var Server = require('./Server.js');

module.exports = Webtask.fromServer(Server.Http);
