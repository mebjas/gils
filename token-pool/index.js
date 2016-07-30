var express = require('express');
var bodyParser = require('body-parser');
var tokens = require('./tokens');

var app = express();
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
})); 

// DS to store all discovery information
var discovery = function() {
    this.boss = {};
    this.workers = [];
}

discovery.prototype.registerBoss = function (req) {
    throw 'TBD Exception';
}

discovery.prototype.registerWorkers = function (req) {
    throw 'TBD Exception';
}
var DS = new discovery();

/**
 * Request to get all tokens from the pool, typically sent by boss
 */
app.get('/get', function(req, res) {
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    var port = req.connection.remotePort;
    console.log("[GET REQUEST] from " +ip +":" +port);
    res.json(tokens);
});

/**
 * Request to add a new token
 */
app.post('/new', function(req, res) {
   throw 'TBD Exception';
});

/**
 * Request to add a new token
 */
app.post('/registerBoss', function(req, res) {
    DS.boss = {
        ip : req.body.ip,
        port: req.body.port
    }
    console.log('BOSS Registered: ' +req.body.ip +':' +req.body.port);
    res.json({error: false, message: 'boss registeration successfull'});
});


app.listen('3000', function (req, res) {
    console.log("App started at port 3000");
});