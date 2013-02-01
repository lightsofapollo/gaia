require('/tests/js/app_integration.js');
require('/tests/js/integration_helper.js');

function VideoIntegration(device) {
  AppIntegration.apply(this, arguments);
}

VideoIntegration.prototype = {
  __proto__: AppIntegration.prototype,
  appName: 'Video'
};

