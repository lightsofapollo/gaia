marionette('Settings', function() {
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

  test('open settings menu', function() {
    $('.test-settings-toggle').tap();
    client.helper.waitForElement('.settings');
  });

  test('enables grid', function() {
    $('.test-settings-toggle').tap();
    client.helper.waitForElement('.settings');
    $('.test-grid-setting').tap();
    client.helper.waitForElement('.setting-options');
    $('.setting-option[data-key=on]').tap();
    client.helper.waitForElement('.notification li');
    client.helper.waitForElement('.viewfinder-grid');
  });

  test('enables flash', function() {
    if(camera.flash) {
      $('.test-flash-button').tap();
    }
  });

});
