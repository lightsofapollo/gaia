(function(window) {
  var support;
  if (typeof(window.testSupport) === 'undefined') {
    window.testSupport = {};
  }

  support = window.testSupport;

  /**
   * Returns a filesystem apps relative to the root of gaia.
   *
   * @param {String} path relative path.
   * @return {String} absolute path output.
   */
  support.appPath = function(path) {
    return _IMPORT_ROOT + '/../../' + path;
  };

  support.startMarionette = function(cb) {
    var device;

    suiteSetup(function() {
      var driver;
      this.timeout(10000);

      if (typeof(window.TCPSocket) === 'undefined') {
        throw new Error('TCPSocket must be present to run integration tests');
      }

      driver = new Marionette.Drivers.MozTcp();

      yield driver.connect(MochaTask.next);

      device = new Marionette.Client(driver, {
        defaultCallback: MochaTask.nextNodeStyle
      });

      yield device.startSession();

      cb(device);
    });

    suiteTeardown(function() {
      this.timeout(10000);
      yield device.deleteSession();
    });

  }
}(this));

