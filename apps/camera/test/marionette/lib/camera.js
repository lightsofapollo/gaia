/* global marionette */
'use strict';

function Camera(client) {
  this.client = client || marionette.client();
  this.$ = require('./mquery')(client);
}

Camera.prototype = {
  URL: 'app://camera.gaiamobile.org',

  selectors : {
    controls : '.test-controls',
    viewfinder : '.viewfinder.js-viewfinder',
    hud : '.hud'
  },

  launch: function() {
    this.client.apps.launch(this.URL);
    this.client.apps.switchToApp(this.URL);
    this.waitForPreviewReady();
  },

  close: function() {
    this.client.apps.close(this.URL);
  },

  waitForPreviewReady: function() {
    var viewfinder = this.selectors.viewfinder;
    this.client.helper.waitForElement(viewfinder + '.visible');
  },

  waitForControlsEnabled: function() {
    var controls = this.selectors.controls;
    this.client.helper.waitForElement(controls + '[enabled=true]');
  },

  get mode() {
    var controls = this.selectors.controls;
    if($(controls + '[mode=picture]')[0]) {
      return 'picture';
    } else {
      return 'video';
    }
  },

  get flash() {
    var hud = this.selectors.hud;
    return this.$(hud + '[flash-enabled=true]')[0];
  }

};

module.exports = Camera;
