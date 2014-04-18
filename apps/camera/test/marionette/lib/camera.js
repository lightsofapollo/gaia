/* global marionette */
'use strict';

var $ = require('./mquery');

function Camera(client) {
  this.client = client || marionette.client({
    prefs: {
      'focusmanager.testmode': true
    }
  });
  $.client = client;
}

Camera.prototype = {
  origin: 'app://camera.gaiamobile.org',

  launch: function() {
    this.client.apps.launch(this.origin);
    this.client.apps.switchToApp(this.origin);
    this.waitForPreviewReady();
  },

  restart: function() {
    this.client.apps.close(this.origin);
    this.launch();
  },

  waitForPreviewReady: function() {
    this.client.helper.waitForElement('.viewfinder.js-viewfinder.visible');
  }

};

module.exports = Camera;


