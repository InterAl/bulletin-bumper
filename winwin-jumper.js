var request = require("request");
var Q = require("q");
var cheerio = require("cheerio");
var toughCookie = require("tough-cookie");
var inspect = require("util").inspect;
var _ = require("lodash");

function Jumper(username, password) {
  var that = this;
  
  this.jump = function () {
    var deferred = Q.defer();
    
    this.login()
        .then(function (loginSuccess) {
          if (loginSuccess)
            return that.getAllCategories();
          return Q.reject("login failed");
        })
        .then (function(categoryUrls) {
          return Q.all(categoryUrls.map(function(i, url) {
            return that.getAllPostedMessages(url).then(function(msgs) {
              return that.jumpMessages(msgs);
            });
          }));
        })
        .then (function(messages) {
          console.log("finished jumping.");
        })
        .catch(function (err) {
          console.log("error:", err);
          deferred.reject();
        });

    return deferred.promise;
  };

  this.login = function () {
    return sessionRequest({
      method: 'post',
      body: {
        pass: password,
        remember: false,
        username: username
      },
      json: true,
      url: "http://www.winwin.co.il/SOA/Login.asmx/TryLogin"
    }, true)
    .then(function (res) {
      return res.body.d === true;
    });
  };

  this.getAllCategories = function() {
    return sessionRequest({
      url: "http://www.winwin.co.il/Personal/PublishedAds/SecHand/PersonalPage.aspx"
    })
    .then(function (res) {
      var $ = cheerio.load(res.body);
      var links = $(".menuContainer .links a");
      return links.map(function(i, l) {
        return l && l.attribs ? l.attribs.href : null;
      });
    });
  };

  this.getAllPostedMessages = function(categoryUrl) {
    return sessionRequest(
      {
        url: categoryUrl
      }
    ).then(function (res) {
      console.log("fetched", categoryUrl);
      function extractNsid() {
        var nsid = /nsid=(.*?);/.exec(res.body);
        if (nsid && nsid.length > 1)
          return nsid[1];
      }
      
      function extractMessageIds() {
        var ids = [];
        var match;
        var pattern = /"trOpen(\d+)"/g;
        while ((match = pattern.exec(res.body)) != null) {
          if (match && match.length > 1)
            ids.push(match[1]);
        }
        
        return ids;
      }

      return {
        nsid: extractNsid(),
        messageIds: extractMessageIds()
      };
    });
  };
  
  this.jumpMessages = function(categoryMessages) {
    return Q.all(categoryMessages.messageIds.map(function (msg) {
      var nsid = categoryMessages.nsid;
      console.log("jumping msg", nsid);
      return sessionRequest({
        url: "http://www.winwin.co.il/SOA/Personal.asmx/SetDataSetChangesObjects",
        method: "post",
        body: {
          date: "20/06/2015 19:57:18",
          nsid: nsid,
          objid: msg
        },
        json: true
      }).then(function (res) {
        console.log("jumped", msg);
      }).catch (function(res) {
        console.log("failed jumping", msg);
      });
    }));
  }
  
  function sessionRequest(options, newJar) {
    options.method = options.method || "get";
    options.jar = true;

    var deferred = Q.defer();

    if (newJar)
      request.jar();

    request(options, function(err, res, body) {
      var resObj = { err: err, res: res, body: body };
      if (res && res.statusCode === 200)
        deferred.resolve(resObj);
      else
        deferred.reject(resObj);
    });
    
    return deferred.promise;
  }
}

module.exports = Jumper;