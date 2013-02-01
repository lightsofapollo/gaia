require('apps/video/test/integration/app.js');
require('/tests/js/performance_helper.js');

suite('Video', function() {
  var device;
  var app;

  MarionetteHelper.start(function(client) {
    app = new VideoIntegration(client);
    device = app.device;
  });

  test('average startup time', function() {
    yield app.launch();
    yield app.close();
  });
});

