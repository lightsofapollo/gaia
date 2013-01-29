(function(window) {
  var loader = NotAmd(Calendar.LoadConfig);

  window.suiteGroup = function suiteGroup(name, callback) {
    suite(name, function() {

      suiteSetup(function(done) {
        loader.load('group', name, done);
      });

      callback();
    });
  };

}(this));
