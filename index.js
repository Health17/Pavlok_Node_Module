//Write token to filesystem
var fs = require('fs');

//Open browser
var open = require('open');

//Run server to do OAuth
var express = require('express');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

//Passport for OAuth support
var passport = require('passport');
var oauth = require('passport-oauth');
var OAuth2Strategy = oauth.OAuth2Strategy;

//Request to query API
var request = require('request');

const PORT = 3000;
const TOKEN_FILENAME  = "./pavlok-token.json";

//Support functions
function log(msg){
    if(verbose) console.log("[Pavlok API] " + msg);
}

//Setup auth token loading
var tokenFile;
function createTokenFile(){
    try {
        var skeletonObject = {
            token: null
        }
        fs.writeFileSync(TOKEN_FILENAME, JSON.stringify(skeletonObject, null,
            2));
        tokenFile = skeletonObject;
    } catch(e) {
        throw "Can't access disk for saving token for Pavlok API!";
    }
}

function clearTokenFile(){
    try {
        tokenFile.token = null;
        code = null;
        fs.unlinkSync(TOKEN_FILENAME);
    } catch(e) {
        throw "Couldn't delete auth token!";
    }
}

try {
    tokenFile = require(TOKEN_FILENAME);
} catch (e) {
    createTokenFile();
    tokenFile = require(TOKEN_FILENAME);
}

function saveTokenFile(token){
    try {
        tokenFile.token = token;    
        code = token;
        signingIn = false;
        fs.writeFileSync(TOKEN_FILENAME, JSON.stringify(tokenFile, null, 2));
    } catch(e) {
        throw "Can't access disk to save Pavlok auth token!";
    }
}

var tokenFromFile = tokenFile.token;

var verbose = false;
var signingIn = false;
var code = null;
if(tokenFromFile != null){
    code = tokenFromFile;
}

//Setup Express server; used to handle OAuth2 results
var app = express();
var server;
app.use(express.static('public'));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(passport.initialize());
app.use(passport.session());

app.get("/", function(request, result){
    result.redirect("/index.html");
});

app.get("/done", function(request, result){
    result.redirect("/done.html");
    if(code != null) server.close();
});

app.get("/error", function(request, result){
    result.redirect("/error.html");
});

app.get("/auth/pavlok",
    passport.authenticate("oauth2",
    {
        "session": false,
        "failureRedirect": "/error"
    }));

app.get("/auth/pavlok/result",
    passport.authenticate("oauth2", 
    { 
        "session": false,
        "successRedirect": "/done",
        "failureRedirect": "/error"
    }));

//Exports

var exports = module.exports = {};

/**
  Login into Pavlok's API. Note that this relies on Node being able to listen
  on port 3000, and Node being able to write to ./pavlok-token.json.
  
  @param {String} Client ID
  @param {String} Client secret
  @param {Boolean} Verbose debugging
  @param {Function} callback - Callback with two arrguments. First argument 
                               is true or false depending on success/failure,
                               and the second is the auth token on success.
**/
exports.login = function(cId, cSecret, debug, callback){
    verbose = debug;
    if(code != null){
        log("Code loaded from disk: " + code);
        callback(true, code);
        return;
    } else {
        log("Unable to load code from disk; starting server...");
    }
        
    server = app.listen(PORT, function(){
        open("http://localhost:3000/auth/pavlok");
    });
       
    passport.use(new OAuth2Strategy({
        authorizationURL: "http://pavlok-mvp.herokuapp.com/oauth/authorize",
        tokenURL: "http://pavlok-mvp.herokuapp.com/oauth/token",
        clientID: cId,
        clientSecret: cSecret,
        callbackURL: "http://localhost:3000/auth/pavlok/result"    
    },
    function(token, tokenRefresh, profile, done){
        if(token != null){
            log("Saving " + token + " token to disk...");
            saveTokenFile(token);
            signingIn = false;
            callback(true, token);
        } else {
            log("Token not found!");
            saveTokenFile(null);
            signingIn = false;
            callback(false, null);
        }

        return done(null, {}); //No user object checking for Pavlok's API
    }));

    signingIn = true;
}

exports.logout = function(){
    clearTokenFile();
}    

function genericCall(route, intensity, callback){
    var address = "http://pavlok-mvp.herokuapp.com/api/v1/stimuli/"
            + route + "/" + intensity;
    var queryParams = {
            access_token: code,
            time: new Date()
    };

    log("Trying to " + route + " with " + intensity + "...");
    if(signingIn){
        callback(false, "Please wait until login completes.");
        return;
    }

    if(code == null){
        callback(false, "Please login before using the API.");
        return;
    }

    if(intensity < 1 || intensity > 255){
        callback(false, "Intensity outside accepted bounds!");
        return;
    }

    request({
        url: address,
        qs: queryParams,
        method: 'POST',
    }, function(error, response, body){
        if(error){
            callback(false, error);
        } else {
            if (response.statusCode == 401) {
                clearTokenFile();
                callback(false, "Your auth token has expired!");
            } else if (response.statusCode == 200) {
                callback(true, route + " sent.");
            } else {
                callback(false, route + " returned unknown code: " + 
                    response.statusCode + ".");
            }
        }
    });
}

exports.beep = function(value, callback){
    genericCall("beep", value, callback);
}

exports.vibrate = function(value, callback){
    genericCall("vibration", value, callback);
}

exports.zap = function(value, callback){
    genericCall("shock", value, callback);
}