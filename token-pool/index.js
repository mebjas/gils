var express = require('express');
var bodyParser = require('body-parser');
var sprintf = require('sprintf').sprintf;
var request = require('request');
var tokens = require('./tokens');


var app = express();
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
})); 

// DS to store all discovery information
/* REGION: Discovery class */{
    var discovery = function() {
        this.boss = {};
        this.workers = [];
    }

    discovery.prototype.registerBoss = function (boss) {
        this.boss = boss;
        this.workers = [];
        console.log('BOSS Registered: ' +boss.ip +':' +boss.port);
        console.log('ALL Workers data cleared; WORKERS: ', this.workers);
    }

    discovery.prototype.registerWorker = function (worker) {
        this.workers.push(worker);
        console.log("WORKER ADDED TO SYSTEM", worker);
        console.log('Worker Registered on port:', worker.port);
    }
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
    var t = req.body.token;
    var l = req.body.login;
    console.log(sprintf("new token request with token: %s, login: %s", t, l));

    var token =  {
        token: t,
        login: l,
        remaining: 0,
        last_request: -1,
        next: 0
    };

    tokens.push(token);
    // send the message downstream

    // TODO: remove protocol harcoding    
    var bossAddr = sprintf("http://%s:%s/", DS.boss.ip, DS.boss.port);
    request.post(bossAddr +'/new', {form: {token: token}}, function (err, httpResponse, body) {
        if (err) {
            console.log('[error] Unable to feed new token information to boss');
            return;
        }
        console.log('Informed Boss about new token');
        res.json({error: false, message: 'new token added successfully'});
    });
});

/**
 * Request to register boss
 */
app.post('/registerBoss', function(req, res) {
    DS.registerBoss({
        ip : req.body.ip,
        port: req.body.port
    });
    res.json({error: false, message: 'boss registeration successfull'});
});

/**
 * Request to register workers
 */
app.post('/registerWorker', function(req, res) {
    // TODO: validate the params
    var worker = {
        host: "http://localhost", // TODO: remove this localhost hardcoding
        port: req.body.port,
        getAddr: function() {
            return this.host +':' +this.port +'/';
        },
        token: req.body.token
    }

    DS.registerWorker(worker);
    res.json({error: false, message: 'worker registeration successfull'});
});


app.listen('3000', function (req, res) {
    console.log("App started at port 3000");
});