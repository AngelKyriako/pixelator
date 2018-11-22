var config = require('./config.js');

var Server = require('./Server.js');

Server.Http.listen(config.port, '0.0.0.0', function onStart(req, res) {
  console.info('application is listening at uri: ', config.serverUri);
});
