// Licensed under the Apache 2.0 License. See footer for details.

var crypto = require('crypto'),
    algorithm = 'AES-256-CTR';

module.exports.putUser = function(req, res) {
  var app = req.app;
  var cloudant = app.get('cloudant-location-tracker-db');
  if (!cloudant) {
    return res.status(500).json({ error: 'No database server configured' })
  }
  if (!req.body) {
    return res.sendStatus(400);
  }
  if (req.params.id != 'org.couchdb.user:' + req.body.name) {
    // TOOD: Better handle this error
    return res.sendStatus(400);
  }
  var usersDb = cloudant.use('users');
  cloudant.generate_api_key(function(err, api) {
    if (!err) {
      cloudant.set_permissions({database:'location-tracker', username:api.key, roles:['_reader', '_writer']}, function(err, result) {
        if (!err) {
          var cipher = crypto.createCipher(algorithm, req.body.password);
          var encryptedApiPassword = cipher.update(api.password, 'utf8', 'hex');
          encryptedApiPassword += cipher.final('hex');
          var user = {
            _id: req.params.id,
            name: req.body.name,
            api_key: api.key,
            api_password: encryptedApiPassword
          };
          usersDb.insert(user, user._id, function(err, body) {
            if (!err) {
              res.status(201).json({
                ok: true,
                id: user._id,
                rev: body.rev
              });
            } else {
              console.error(err);
              res.status(500).json({error: 'Internal Server Error'});
            }
          });
        } else {
          console.error(err);
          res.status(500).json({error: 'Internal Server Error'});
        }
      });
     } else {
        console.error(err);
        res.status(500).json({error: 'Internal Server Error'});
     }
  });
};

module.exports.postSession = function(req, res) {
  var app = req.app;
  var cloudant = app.get('cloudant-location-tracker-db');
  if (!cloudant) {
    return res.status(500).json({ error: 'No database server configured' })
  }
  if (!req.body) {
    return res.sendStatus(400);
  }
  var usersDb = cloudant.use('users');
  usersDb.get('org.couchdb.user:' + req.body.name, function(err, body) {
    if (!err) {
      var decipher = crypto.createDecipher(algorithm, req.body.password);
      var decryptedApiPassword = decipher.update(body.api_password, 'hex', 'utf8');
      decryptedApiPassword += decipher.final('utf8');
      cloudant.auth(body.api_key, decryptedApiPassword, function(err, body, headers) {
        if (!err) {
          // TODO: This is a hack to deal with running app locally
          var cookieData = {};
          var cookieKeyValues = headers['set-cookie'][0].split(';');
          cookieKeyValues.map(function(keyValueString) {
              var keyValue = keyValueString.trim().split('=');
              cookieData[keyValue[0]] = keyValue[1];
          });
          var cookie = '';
          for (var key in cookieData) {
              switch (key) {
                  case 'AuthSession':
                      cookie += 'AuthSession=' + cookieData[key]
                      break;
                  case 'Version':
                      cookie += '; Version=' + cookieData[key]
                      break;
                  case 'Expires':
                      cookie += '; Expires=' + cookieData[key]
                      break;
                  case 'Max-Age':
                      cookie += '; Max-Age=' + cookieData[key]
                      break;
                  case 'Path':
                      cookie += '; Path=' + cookieData[key]
                      break;
                  case 'HttpOnly':
                      cookie += '; HttpOnly'
                      break;
                  case 'Secure':
                      // Intentionally not set
                      break;
              }
          }
          res.setHeader('Set-Cookie', cookie);
          res.json({
            ok: true,
            name: req.body.name,
            roles: body.roles
          });
        } else {
          res.status(500).json({error: 'Internal Server Error'});
        }
      });
    } else {
      res.status(500).json({error: 'Internal Server Error'});
    }
  });
};

//-------------------------------------------------------------------------------
// Copyright IBM Corp. 2015
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//-------------------------------------------------------------------------------
