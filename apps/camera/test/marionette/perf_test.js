marionette('Performance', function() {
  'use strict';

  var assert = require('assert');
  var client = marionette.client();
  var $ = require('./lib/mquery')(client)
  var camera = new (require('./lib/camera'))(client);

  setup(function() {
    camera.close();
  });

  test('time to first picture', function() {
    camera.launch();
    camera.waitForControlsEnabled();
    $('.test-capture').tap();
    client.helper.waitForElement('.test-thumbnail');
  });

});
