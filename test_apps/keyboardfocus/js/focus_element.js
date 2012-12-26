let focusElement = (function() {
  if (typeof(debug) === 'undefined') {
    var debug = console.log;
  }

  function findScrollable(node) {
    var nodeContent = node.ownerDocument.defaultView;

    while (!(node instanceof HTMLBodyElement)) {
      var style = nodeContent.getComputedStyle(node, null);

      var overflow = [style.getPropertyValue('overflow'),
                      style.getPropertyValue('overflow-x'),
                      style.getPropertyValue('overflow-y')];

      var rect = node.getBoundingClientRect();
      var isAuto = (overflow.indexOf('auto') != -1 &&
                   (rect.height < node.scrollHeight ||
                    rect.width < node.scrollWidth));

      var isScroll = (overflow.indexOf('scroll') != -1);

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

  function yAxisVisible(top, height, maxHeight) {
    if (top > 0 && (top + height) < maxHeight) {
      return true;
    }
    return false;
  }

  function scrollablesVisible(element, rect) {
    while ((element = findScrollable(element))) {
      if (element.window && element.self === element) {
        break;
      } else {
        var offset = element.getBoundingClientRect();
        var adjusted = {
          top: rect.top - offset.top,
          height: rect.height,
          width: rect.width
        };

        var visible = yAxisVisible(
          adjusted.top,
          adjusted.height,
          element.clientHeight
        );

        debug(
          'scrollablesVisible\n' +
          'top: ' + adjusted.top + '\n' +
          'height: ' + adjusted.height + '\n' +
          'clinet height: ' + element.clientHeight + '\n'
        );

        if (!visible) {
          debug('NOT VISIBLE: ' + element.outerHTML);
          return false;
        }

        element = element.parentNode;
      }
    }

    return true;
  }

  function isVisible(element) {
    // scrollable frames can be ignored we just care about iframes...
    var rect = element.getBoundingClientRect();
    var parent = element.ownerDocument.defaultView;

    var result = {
      top: rect.top,
      height: rect.height,
      width: rect.width
    };

    var isVisible = true;

    do {
      var frame = parent.frameElement;

      if (isVisible) {
        isVisible = yAxisVisible(
          result.top,
          result.height,
          parent.innerHeight
        );

        debug(
          'isVisible\n' +
          'top: ' + result.top + ' \n' +
          'height: ' + result.height + ' \n' +
          'inner height: ' + parent.innerHeight + '\n'
        );

        isVisible = isVisible && scrollablesVisible(
          element, result
        );
      }

      if (frame) {
        var frameRect = frame.getBoundingClientRect();
        var top =
          parseInt(parent.getComputedStyle(frame, '').borderTopWidth, 10);

        result.top += frameRect.top + top;
      }

    } while (
      (parent !== parent.parent) &&
      (parent = parent.parent)
    );

    return [isVisible, result];
  }

  return function focusElement(window, element) {
    var [visible, rect] = isVisible(element);

    if (visible)
      return;

    if (rect.top > (window.innerHeight / 2)) {
      // align to bottom
      element.scrollIntoView(false);
    } else {
      // align to top
      element.scrollIntoView(true);
    }
  }

}());
