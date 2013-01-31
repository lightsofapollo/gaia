Calendar.ns('Controllers').Accounts = (function() {
  'use strict';

  function Accounts(app) {
    this.app = app;

    this.calendarStore = app.store('Calendar');
    this.accountStore = app.store('Account');
  }

  function storeInterface(api, storeProperty) {
    var cacheName = '_' + api + 'Cache';

    Accounts.prototype[api] = function allRecords(callback) {
      var self = this;
      if (this[cacheName]) {
        return Calendar.nextTick(function() {
          callback(null, self[cacheName]);
        });
      }

      this[storeProperty].load(function(err, list) {
        if (err)
          return callback(err);

        callback(null, (self[cacheName] = list));
      });
    };
  }

  storeInterface('calendars', 'calendarStore');
  storeInterface('accounts', 'accountStore');

  return Accounts;
}());
