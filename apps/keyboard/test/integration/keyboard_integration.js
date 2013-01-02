require('/tests/js/app_integration.js');

function KeyboardIntegration() {
  AppIntegration.apply(this, arguments);
}

KeyboardIntegration.prototype = {
  __proto__: AppIntegration.prototype,

  appName: 'Keyboard Integration',

  selectors: {
    'input1': '#input-1',
    'input2': '#input-2',
    'input3': '#input-3',
    'input4': '#input-4'
  }

};
