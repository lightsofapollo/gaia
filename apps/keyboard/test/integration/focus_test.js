require('/apps/keyboard/test/integration/keyboard_integration.js');

suite('keyboard input focus', function() {

  var device;
  var helper = IntegrationHelper;
  var app;

  suiteTeardown(function() {
    //yield app.close();
  });

  MarionetteHelper.start(function(client) {
    app = new KeyboardIntegration(client);
    device = app.device;
  });

  suiteSetup(function() {
    yield app.launch();
  });

  test('display', function() {
    var frame = yield device.findElement('iframe');

    yield device.switchToFrame(frame);

    var first = yield device.querySelector('#')

    var element = yield first.scriptWith(function(el) {

      function scrollableNode(node) {
        let nodeContent = node.ownerDocument.defaultView;

        while (!(node instanceof HTMLBodyElement)) {
          let style = nodeContent.getComputedStyle(node, null);

          let overflow = [style.getPropertyValue('overflow'),
                          style.getPropertyValue('overflow-x'),
                          style.getPropertyValue('overflow-y')];

          let rect = node.getBoundingClientRect();
          let isAuto = (overflow.indexOf('auto') != -1 &&
                       (rect.height < node.scrollHeight ||
                        rect.width < node.scrollWidth));

          let isScroll = (overflow.indexOf('scroll') != -1);

          if (isScroll || isAuto) {
            return node;
          }

          node = node.parentNode;
        }

        if (nodeContent.scrollMaxX || nodeContent.scrollMaxY) {
          return nodeContent;
        }

        return null;
      }

      var rects = [el.getBoundingClientRect()];
      var next;
      var last;

      for (next = scrollableNode(el);
           next && next !== last; next = scrollableNode(el)) {

        if (next instanceof HTMLElement) {
          rects.push(next.getBoundingClientRect());
        }

        last = next;
      }

      return rects;
    });

    console.log(element);
  });

});
