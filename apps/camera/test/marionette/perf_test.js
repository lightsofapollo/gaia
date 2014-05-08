marionette('Performance', function() {
  'use strict';

  teardown(function() {
    camera.close();
  });

  var assert = require('assert');
  var client = marionette.client();
  var $ = require('./lib/mquery')(client)
  var camera = new (require('./lib/camera'))(client);

  setup(function() {
    camera.launch();
  });

  test('time to first picture', function() {
    camera.waitForControlsEnabled();
    $('.test-capture').tap();
    client.helper.waitForElement('.test-thumbnail');
  });

});
