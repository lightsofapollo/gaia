marionette('Capture', function() {
  'use strict';

  var assert = require('assert');
  var client = marionette.client();
  var $ = require('./lib/mquery')(client)
  var camera = new (require('./lib/camera'))(client);

  setup(function() {
    camera.restart();
  });

  test('capture a picture', function() {
    $('.test-capture').tap();
    client.helper.waitForElement('.test-thumbnail');
  });

});
