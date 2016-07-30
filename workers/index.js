var express = require('express');
var sprintf = require('sprintf').sprintf;
var request = require('request');
var bodyParser = require('body-parser');
var fs = require('fs');
var github = require('octonode');

var app = express();
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));

// Get a port number for this worker
var tokenstore = 'http://localhost:3000/';

if (process.argv.length < 5) {
    console.log('[error] [worker] Arguments not provided.');
    process.exit(0);
}


// TODO: Validate these tokens
var token = process.argv[2];
var bossAddr = process.argv[3];
var ID = parseInt(process.argv[4]);
console.log(sprintf("WORKER#%d started with token: %s", ID, token));
console.log(sprintf("WORKER#%d started with BOSS ADDR: %s", ID, bossAddr));

// register with the boss, and get a port number for self.
request.post(bossAddr +'register', {form: {token: token}}, function (err, httpResponse, body) {
    if (err) {
        return console.error('worker registeration failed:', err);
    }

    // TODO: validate if tokenstore sent error = false
    var response = JSON.parse(httpResponse.body);
    var port = response.port;

    app.listen(port, function (req, res) {
        console.log('worker listening to port, ', port);
    });
})
