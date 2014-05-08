marionette('Capture', function() {
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

  test('capture a picture', function() {
    $('.test-capture').tap();
    client.helper.waitForElement('.test-thumbnail');
  });

  test('capture a video', function(done) {
    $('.test-switch').tap();
    camera.waitForPreviewReady();
    $('.test-capture').tap();
    client.helper.waitForElement('.recording-timer.visible');
    // It records a 3 seconds video
    setTimeout(function(){
      $('.test-capture').tap();
      client.helper.waitForElement('.test-thumbnail');
      done();
    }, 3000);
  });

  test('capture a picture', function() {
    $('.test-capture').tap();
    client.helper.waitForElement('.test-thumbnail');
  });

});
