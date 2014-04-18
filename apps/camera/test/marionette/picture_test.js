marionette('Capture', function() {
  'use strict';

  var assert = require('assert');
  var $ = require('./lib/mquery');
  var client = marionette.client();
  var camera = new (require('./lib/camera'))(client);

  setup(function() {
    camera.restart();
  });

  test('capture a picture', function(done) {
    $('.test-capture').tap();
    client.helper.waitForElement('.test-thumbnail');
  });

});
