﻿var request = require("request");
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
            return that.getAllPostedMessages(url);
          }));
        })
        .then(function(detailUrls) {
          var tasks = detailUrls.map(function(i, obj) {
            return obj.detailUrls.map(function(url, j) {
              var detailsUrl = "http://my.yad2.co.il/MyYad2/MyOrder/" + url;
              return that.getOrderId(detailsUrl, obj.referer)
                .then(function(orderId) {
                  return that.jumpMessage(detailsUrl, orderId);
                });
            });
          });

          tasks = _.flatten(tasks);

          return Q.all(tasks);
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
      form: {
        UserName: username,
        password: password
      },
      url: "http://my.yad2.co.il/newOrder/index.php?action=connect"
    }, true)
    .then(function (r) {
      return r.res.statusCode === 200;
    });
  };

  this.getAllCategories = function () {
    var indexUrl = "http://my.yad2.co.il/MyYad2/MyOrder/index.php";
    return sessionRequest({
      url: indexUrl
    })
    .then(function (res) {
      var $ = cheerio.load(res.body);
      var links = $("a").filter(function(i, a) {
        return /^[^/]+\.php$/g.test(a.attribs.href);
      });
      return links.map(function(i, l) {
        return changeUrlPage(indexUrl, l.attribs.href);
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
      function extractMessageIds() {
        var urls = [];
        var match;
        
        var pattern = /javascript:show_me\('(.*?)'/g;
        while ((match = pattern.exec(res.body)) != null) {
          if (match && match.length > 1)
            urls.push(match[1]);
        }        
        return _.uniq(urls);
      }

      return { referer: categoryUrl, detailUrls: extractMessageIds() };
    });
  };

  this.getOrderId = function(url, referer) {
    return sessionRequest(
      {
        url: url,
        headers: {
          referer: referer
        }
      }
    ).then(function(res) {
      var match = /<b>(\d+)<\/b>/gi.exec(res.body);
      if (match && match.length > 1)
        return match[1];
    });
  };

  this.jumpMessage = function(detailsUrl, orderId) {
    var jumpUrl = changeUrlPage(detailsUrl, "Akpaza_Popup.php?OrderID=" + orderId);
    return sessionRequest({
      url: jumpUrl
    });
  };
  
  function sessionRequest(options, newJar) {
    options.method = options.method || "get";
    options.jar = true;

    var deferred = Q.defer();

    if (newJar)
      request.jar();

    request(options, function(err, res, body) {
      var resObj = { err: err, res: res, body: body };
      deferred.resolve(resObj);
    });
    
    return deferred.promise;
  }
  
  function changeUrlPage(fullUrl, page) {
    var parts = fullUrl.split("/");
    parts[parts.length - 1] = page;
    return parts.join("/");
  }
}

module.exports = Jumper;