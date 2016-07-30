var express = require('express');
var request = require('request');
var bodyParser = require('body-parser');
var fs = require('fs');
var github = require('octonode');
var fork = require('child_process').fork;
var portfinder = require('portfinder');
var sprintf = require('sprintf').sprintf;
var metadata = require('./metadata');

var app = express();
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
})); 

var tokenstore = 'http://localhost:3000/';
var selfaddr = 'http://localhost:3001/';
var dataset = '../dataset/data.csv';
var tokens = [];
var client = null;     // GITHUB CLIENT
var metadatFile = './metadata.js';

/**
 * DATA Api for logging from workers.
 */
app.post('/data', function (req, res) {
    // TODO: Verify the data
    if (typeof req.body.data == undefined) {
        console.log('[error] DATA API called without required data param');
        return;
    }

    var data = JSON.parse(req.body.data);
    var log = data.issue;
    if (data.labels.length) {
        var labels = [];
        data.labels.forEach(function (label) {
            labels.push(label);
            // TODO: verify this param
        });
        log = [data.issue, labels.join(',')].join(',') +"\r\n";
    } else {
        log += "\r\n";
    }

    fs.appendFile(dataset, log, function (err) {
        if (err) {
            console.log('[error] ERROR While appending to dataset', err);
        }
    });
    res.json({error: false, message: 'logging promised. A promise can fail too though'});
});

/**
 * Api for workers to register
 */
app.post('/register', function (req, res) {
    // TODO: validate the data
    var token = req.body.token;

    // Find a free port
    portfinder.getPort(function (err, port) {
        // register it with token store
        request.post(tokenstore +'registerWorker', {form: {token: token, port: port}}, function (err, httpResponse, body) {
            if (err) {
                return console.error('worker registeration failed:', err);
            }

            // TODO: validate if tokenstore sent error = false
            var response = JSON.parse(httpResponse.body);
            if (response.error) {
                return console.error('worker registeration failed:', response.error);
            }

            // send it downstream
            res.json({port: port});
        })
    });

})

app.listen('3001', function (req, res) {
    console.log('Boss started at 3001. \nRegistering self as BOSS!');
    // register itself as boss
    request.post(tokenstore +'registerBoss', {form: {ip:'127.0.0.1', port: '3001'}}, function (err, httpResponse, body) {
        if (err) {
            return console.error('register boss failed:', err);
        }
        console.log('register boss successfull');

        // Get all tokens
        request.get(tokenstore +'get', function (err, httpResponse, body) {
            if (err) {
                return console.error('get tokens failed:', err);
            }
            tokens = JSON.parse(httpResponse.body);
            console.log('Retrieved ' +tokens.length +' tokens', tokens);

            if (tokens.length) {
                // note 0th index always by the BOSS
                client = github.client(tokens[0].token);
                console.log(sprintf("BOSS Took the first token for itself"));

                var organisations = client.get('/organizations', metadata.since, metadata.perPage, true, function(err, body, header) {
                     if (err) {
                        console.log("GITHUB API ERROR, ", err);
                        return;
                    }
                    
                    //fs.writeFileSync(metadatFile, JSON.stringify({since: since}));
                    // console.log(header);
                });
            }

            // Now spawn workers corresponding to this tokens
            tokens.forEach(function(token, index) {
                if (!index) return;
                console.log('spawning a worker');
                var child = fork('../workers/index.js', [token.token, selfaddr, index]);
            });
        });
    });
});
