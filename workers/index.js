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
    console.log("Worker" +ID +": [ORG] " +org.login)
    ghorg.repos(function(err, data, headers) {
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
                console.log(sprintf("WORKER%s will hibernate till", ID));
                console.log(new Date(resetTime * 1000));

                // hibernate till API LIMIT reset period + 1;
                // Ask boss to push this org back to queue
                request.post(bossAddr +'pushback', {form: {org: org}});
                setTimeout(next, (resetTime - Math.round(new Date().getTime() / 1000))*1000 + 1000);
                return;
            } else if (typeof err.message != 'undefined'
                && err.message.indexOf('an abuse detection mechanism') === 0) {
                // case abuse detection
                // hibernate till API LIMIT reset period + 1;
                // Ask boss to push this org back to queue
                console.log("Abuse detection detected, hibernate for 10min")
                request.post(bossAddr +'pushback', {form: {org: org}});
                setTimeout(next, 10 * 60 * 1000);
                return;
            } else {
                console.log("Some other error for ORG: " +org.login)
                console.log(err);
                console.log("Skipping this org, hibernating for 30sec")
                setTimeout(function() {
                    next();
                }, 1000 * 30);
                return;
            }
        }

        var repoCount = data.length, covered = 0;
        if (!repoCount) {
            lastOrgId = org.id;
            return next();
        }

        lastOrgId = org.id;
        // take care of pagination
        function pullIssues($repo, $ghrepo, pageNo) {
            // TODO: add check for api call limit @priority: high
            $ghrepo.issues({page: pageNo, per_page: 100, state: 'all'},
                function (err, _data, headers) {
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
                        console.log(sprintf("WORKER%s will hibernate till", ID));
                        console.log(new Date(resetTime * 1000));

                        // hibernate till API LIMIT reset period + 1;
                        // Ask boss to push this org back to queue
                        // this will result in loss of some information here but that's fine
                        setTimeout(next, (resetTime - Math.round(new Date().getTime() / 1000))*1000 + 1000);
                        return;
                    } else if (typeof err.message != 'undefined'
                        && err.message.indexOf('an abuse detection mechanism') === 0) {
                        // case abuse detection
                        // hibernate till API LIMIT reset period + 1;
                        // Ask boss to push this org back to queue
                        console.log("Abuse detection detected, hibernate for 10min")
                        setTimeout(next, 10 * 60 * 1000);
                        return;
                    } else {
                        console.log("Some other error for ORG/REPO: " +$repo.full_name)
                        console.log(err);
                        console.log("Skipping this org, hibernating for 30sec")
                        setTimeout(function() {
                            next();
                        }, 1000 * 30);
                        return;
                    }
                } else if (_data.length) {
                    _data.forEach(function (issue) {
                        try {
                            request.post(bossAddr +'data', {form: {data: issue, repo: $repo}});
                        } catch (ex) {
                            var log = {repo: $repo.full_name, login: $repo.id, error :ex};
                            fs.appendFile(logfile, JSON.stringify(log) +"\r\n", function (err) {
                                if (err) {
                                    console.log('[error] ERROR While logging :D, now what', err);
                                }
                            });
                        }
                    });
                    console.log("Worker" +ID +": pulling page " + (pageNo + 1) +" for " +$repo.full_name)
                    pullIssues($repo, $ghrepo, pageNo + 1);
                } else {
                    console.log("Worker" +ID +" Done with " +$repo.full_name)
                    // no entry in the array
                    if (++covered == repoCount) {
                        console.log("Worker" +ID +", finished a repo."
                            + " " +covered +" / " +repoCount)                                                    
                        
                        console.log("Worker" +ID +" Moving on to next")                        
                        next();
                    } else {
                        console.log("Worker" +ID +", finished a repo. Waiting for rest"
                            + " " +covered +" / " +repoCount)                                                    
                    }
                }                    
            });

            }

        data.forEach(function(repo) {
            var fullName = repo.full_name;
            var ghrepo = client.repo(fullName);
            console.log("Worker" +ID +": [repo] [init pull issues] " +fullName)
            pullIssues(repo, ghrepo, 1)
        }, this);
    })
});


