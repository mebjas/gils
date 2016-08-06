/**
 * token-store service
 * deals with incoming tokens and serves as service discovery service.
 */
var express = require('express');
var bodyParser = require('body-parser');
var sprintf = require('sprintf').sprintf;
var request = require('request');
var fs = require('fs');
var tokens = require('./tokens.json');

var app = express();
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
})); 

// TODO: change this to a static class @end
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
    // TODO: put validation on this token.
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

    // save new token in memory
    // TODO: Save this to token.js as well ?
    // make it configurable by req param.
    tokens.push(token);
    // send the message downstream
    // save to file as well.
    fs.writeFileSync('tokens.json', JSON.stringify(tokens), function (err) {
        if (err) {
            console.log('[error] ERROR updating tokens', err);
        }
        return;
    })

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
        host: "http://localhost", // TODO: remove this localhost & protocol hardcoding
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
    console.log("TOKEN-POOL Service started at port 3000");
});