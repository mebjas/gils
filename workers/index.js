// Worker service
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

if (process.argv.length < 5) {
    console.log('[error] [worker] Arguments not provided.');
    process.exit(0);
}

// ------------- global variables -----------------------------------------
var tokenstore = 'http://localhost:3000/';
var logfile = '../logs/log.txt';
// TODO: Validate these tokens
var token = process.argv[2];
var bossAddr = process.argv[3];
var ID = parseInt(process.argv[4]);
var org = null;
var client = github.client(token);
var lastOrgId = null;
console.log(sprintf("WORKER#%d started with token: %s", ID, token));
console.log(sprintf("WORKER#%d started with BOSS ADDR: %s", ID, bossAddr));

// ------------- global functions -----------------------------------------
function next() {
    if (lastOrgId == null) {
        console.log(sprintf('[error] [high] worker%s called next() without setting lastOrgId', ID));
        return;
    }
    request.post(bossAddr +'next', {form: {org: lastOrgId, id: ID}});
}

// register with the boss, and get a port number for self.
request.post(bossAddr +'register', {form: {token: token, id: ID}}, function (err, httpResponse, body) {
    if (err) {
        return console.error('worker registeration failed:', err);
    }

    // TODO: validate if tokenstore sent error = false
    var response = JSON.parse(httpResponse.body);
    var port = response.port;

    app.listen(port, function (req, res) {
        console.log('worker listening to port, ', port);
    });
});

app.post('/work', function(req, res) {
    res.json({error: false});
    // TODO: validate these parameters
    var org = req.body.org;
    if (org == null) {
        // TODO: create a request to add self to free pool @priority:high
        console.log("queue over worker exits");
        process.exit(0);
    }
    console.log(sprintf("WORKER%s dealing with org: %s", ID, org.login));

    var ghorg = client.org(org.login);
    ghorg.repos(function(err,data, headers) {
        if (err) {
            if (typeof err.message != 'undefined'
                && err.message.indexOf('API rate limit exceeded') === 0) {
                    // Case API Limit exceeded.
                    // Get the reset period and set a timeout to ask for next
                    // at that time.
                    if (typeof err.headers == 'undefined') {
                        console.log(sprintf("[error] [high] worker%s [APILIMIT] err.headers undefined", ID));
                        process.exit(0);
                    }

                    var resetTime = parseInt(err.headers['x-ratelimit-reset']);
                    console.log(sprintf("WORKER%s will hibernate till %s", ID, resetTime));

                    // hibernate till API LIMIT reset period + 1;
                    // Ask boss to push this org back to queue
                    request.post(bossAddr +'pushback', {form: {org: org}});
                    setTimeout(next, (resetTime - Math.round(new Date().getTime() / 1000))*1000 + 1000);
                    return;
                }
            console.log("[error] repo fetch error by worker", err, token, org.login);
        }

        var repoCount = data.length, covered = 0;
        if (!repoCount) {
            lastOrgId = org.id;
            return next();
        }

        lastOrgId = org.id;

        data.forEach(function(repo) {
            var fullName = repo.full_name;
            var ghrepo = client.repo(fullName);
            // TODO: add check for api call limit @priority: high
            ghrepo.issues(function (err, _data, headers) {
                if (err) {
                    // TODO: rather than blocking everything out, it should log this to logs
                    // and continue operation.
                    console.log("[error] issue fetch error by worker", err, token, fullName);
                } else if (_data.length) {
                    _data.forEach(function (issue) {
                        try {
                            request.post(bossAddr +'data', {form: {data: issue}});
                        } catch (ex) {
                            var log = {repo: fullName, login: repo.id, error :ex};
                            fs.appendFile(logfile, JSON.stringify(log) +"\r\n", function (err) {
                                if (err) {
                                    console.log('[error] ERROR While logging :D, now what', err);
                                }
                            });
                        }
                    });
                }   

                if (++covered == repoCount) {
                    next();
                }
            });
        }, this);
    })
});


