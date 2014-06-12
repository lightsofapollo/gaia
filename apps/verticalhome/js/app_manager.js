/* global ConfirmDialogHelper */
'use strict';

(function(exports) {

  function AppManager() {
    var self = this;
    navigator.mozApps.getSelf().onsuccess = function(evt) {
      self.app = evt.target.result;
      window.dispatchEvent(new CustomEvent('appmanager-ready'));
    };
    window.addEventListener('gaiagrid-uninstall-mozapp', this);
  }

  AppManager.prototype = {
    get self() {
      return this.app;
    },

    /**
     * General event handler.
     */
    handleEvent: function(e) {
      var _ = navigator.mozL10n.get;

      var nameObj = {
        name: e.detail && e.detail.name
      };

      switch(e.type) {
        case 'gaiagrid-uninstall-mozapp':
          var dialog = new ConfirmDialogHelper({
            type: 'remove',
            title: _('delete-title', nameObj),
            body: _('delete-body', nameObj),
            cancel: {
              title: _('cancel')
            },
            confirm: {
              title: _('delete'),
              type: 'danger',
              cb: function() {
                navigator.mozApps.mgmt.uninstall(e.detail.app);
              }
            }
          });
          dialog.show(document.body);
          break;
      }
    }
  };

  exports.appManager = new AppManager();

}(window));
