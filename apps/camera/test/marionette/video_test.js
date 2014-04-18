marionette('Video', function() {
  'use strict';

  var assert = require('assert');
  var $ = require('./lib/mquery');
  var client = marionette.client();
  var camera = new (require('./lib/camera'))(client);

  setup(function() {
    camera.restart();
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

});
