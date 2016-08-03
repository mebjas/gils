/**
 * boss service
 * boss does all the management, pulls list of orgs from github
 * Spawn workers, Send it downstream to workers, deals with task queues
 * get feedback from workers
 */
// TODO: All these should be immutable, use const
var express = require('express');
var request = require('request');
var bodyParser = require('body-parser');
var fs = require('fs');
var github = require('octonode');
var fork = require('child_process').fork;
var portfinder = require('portfinder');
var freeport = require('freeport');
var sprintf = require('sprintf').sprintf;
var queue = require('../libs/queue');
var metadata = require('./metadata.json');

var app = express();
app.use( bodyParser.json() );        // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({      // to support URL-encoded bodies
  extended: true
}));
metadata.perPage = 100;

// TODO: Remove harcoding from here, this should be derived from some configuration
// file. Every string from now on.
var tokenstore = 'http://localhost:3000/';
var selfaddr = 'http://localhost:3001/';
var dataset = '../dataset/data.csv';
var tokens = [];
var client = null;                  // GITHUB CLIENT
var orgThreshold = 20;              // Get more organizations info, if org in queue
                                    // is less than this.
var metadatFile = './metadata.json';
var rq = new queue(10);             // repo queue
var freeWorkers = new queue();      // free worker queue
var workerYellowPage = {};          // yellow pages for workers
var orgFetchInitiated = false;      // flag to show if there is org fetch going on.

// ------------------ global functions -----------------------
/**
 * function to get organizations using github api and populate the queue
 */
function getOrganizations(client, cb) {
    var organisations = client.get('/organizations', metadata.since, metadata.perPage, true, function(err, status, data) {
        if (err) {
            // TODO: add check for api call limit @priority: high
            orgFetchInitiated = false;
            console.log("GITHUB API ERROR, ", err);
            return;
        }
        
        data.forEach(function(org) {
            rq.push(org);
            console.log(sprintf("%s pushed to queue", org.login));
        });

       orgFetchInitiated = false;
       if (cb != undefined) cb();
    });
}

function getOrgsAndDist(client, useCB) {
    if (orgFetchInitiated) return;
    orgFetchInitiated = true;
    var cb = function () {
        while (freeWorkers.length()) {
            var freeWorker = freeWorkers.pop();
            console.log("Giving work to ", freeWorker);
            request.post(workerYellowPage[freeWorker] +'work', {form: {org: rq.pop()}}, function(err, httpResponse, body) {
                if (err) {
                    console.log("[error] worker threw error when getting work", err);
                    return;
                }
                console.log(sprintf("Free %s given work", freeWorker));
            })
        }
    };
    if (useCB === false) {
        cb = undefined;
    }
    getOrganizations(client, cb);
}
// ------------------ global functions till here -----------------------

/**
 * DATA Api for logging from workers.
 */
app.post('/data', function (req, res) {
    // TODO: Verify the data
    if (typeof req.body.data == undefined) {
        console.log('[error] DATA API called without required data param');
        return;
    }

    var data = req.body.data;
    var log = {issue: data.title, body: data.body,labels: []};
    // console.log(data);
    if (typeof data.labels != 'undefined' && data.labels.length) {
        var labels = [];
        data.labels.forEach(function (label) {
            labels.push(label);
            // TODO: verify this param
        });
        log.labels = labels;
    }

    fs.appendFile(dataset, JSON.stringify(log) +"\r\n", function (err) {
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
    var ID = req.body.id;

    // Find a free port
    freeport(function (err, port) {
        // register it with token store
        request.post(tokenstore +'registerWorker', {form: {token: token, port: port}}, function (err, httpResponse, body) {
            if (err) {
                return console.error('worker registeration failed:', err);
            }

            // feed it to yellow pages
            workerYellowPage['worker' +ID] = sprintf("http://localhost:%s/", port);
            freeWorkers.push('worker' +ID);
            console.log(sprintf("Added to yellow pages: worker%s => %s", ID, workerYellowPage['worker' +ID]));

            // TODO: validate if tokenstore sent error = false
            // TODO: also validte if this sends JSON or JSON Text
            var response = JSON.parse(httpResponse.body);
            if (response.error) {
                return console.error('worker registeration failed:', response.error);
            }

            // send it downstream
            res.json({port: port});

            if (rq.length()) {
                while (freeWorkers.length()) {
                    var freeWorker = freeWorkers.pop();
                    console.log("Giving work to ", freeWorker);
                    request.post(workerYellowPage[freeWorker] +'work', {form: {org: rq.pop()}}, function(err, httpResponse, body) {
                        if (err) {
                            console.log("[error] worker threw error when getting work", err);
                            return;
                        }
                        console.log(sprintf("Free %s given work", freeWorker));
                    })
                }
            }
        })
    });
});

/**
 * Api for workers to ask for next work
 */
app.post('/next', function(req, res) {
    var since = req.body.org;
    var workerID = req.body.id;
    if (parseInt(metadata.since) < parseInt(since)) {
        fs.writeFileSync(metadatFile, JSON.stringify({since: since}));
        metadata.since = since;
    }

    // send response.
    res.json({error: false, message: 'next issued successfully'});

    if (rq.length() < orgThreshold) getOrgsAndDist(client, false);

    if (rq.length() < 1) {
        // TODO: add an internal check in this push method to raise a ticket
        // if a freeworker is free for a longer period.
        freeWorkers.push('worker' +workerID);
        console.log(sprintf("WORKER%s added to freepool, as rq is empty.", workerID));
        return;
    }

    request.post(workerYellowPage['worker' +workerID] +'work', {form: {org: rq.pop()}}, function(err, httpResponse, body) {
        if (err) {
            console.log("[error] worker threw error when getting work", err);
            return;
        }
        console.log(sprintf("Free worker%s given work", workerID));
    });
});

/**
 * Api to push a org back to queue
 */
app.post('/pushback', function (req, res) {
    // TODO: validate this req param
    var org = req.body.org;
    rq.push(org);
    res.json({error: false, message: 'org pushed back to queue'});
})

/**
 * 
 */
app.listen('3001', function (req, res) {
    console.log('Boss started at 3001. \nRegistering self as BOSS!');
    // register itself as boss
    request.post(tokenstore +'registerBoss', {form: {ip:'127.0.0.1', port: '3001'}}, function (err, httpResponse, body) {
        if (err) {
            return console.error('register boss failed:', err);
        }
        console.log('register boss successfull');

        // Get all tokens
        // TODO: this could be a response to registerboss api itself
        request.get(tokenstore +'get', function (err, httpResponse, body) {
            if (err) {
                return console.error('get tokens failed:', err);
            }
            tokens = JSON.parse(httpResponse.body);
            console.log('Retrieved ' +tokens.length +' tokens', tokens);

            if (tokens.length == 1) {
                console.log(sprintf("Only one token in the system. In this world the boss doesn't"));
                console.log(sprintf("share the token with workers so far. We need hippy culture."));
                return process.exit(0);
            }

            if (tokens.length) {
                // note 0th index always by the BOSS
                // TODO: however, it should be used by other workers too to some extent.
                // like if api calls/hr left is more than some threshold lend it to 
                // workers - like a good boss.
                client = github.client(tokens[0].token);
                console.log(sprintf("BOSS Took the first token for itself"));
                getOrgsAndDist(client); 
            }

            // Now spawn workers corresponding to this tokens
            // with 5s timeout that each process get a unique port
            function spawnChild(i) {
                if (!i || i >= tokens.length) return;
                console.log('spawning a worker');
                var token = tokens[i];
                var child = fork('../workers/index.js', [token.token, selfaddr, i]);
                setTimeout(function() {
                    spawnChild(i + 1);
                }, 5000);
            }
            spawnChild(1);
        });
    });
});
