var InputFocus = (function(window) {

  var FOCUS = 'focus';
  var BLUR = 'blur';
  var FOCUS_TIME = 250;

  function applyToFrames(window, event, method) {
    if (window.document.readyState !== 'complete') {
      window.addEventListener('load', function() {
        applyToFrames(window, event, method);
      });
      return;
    }


    window.document.body.addEventListener(event, method, true);
    var iframes = window.document.querySelectorAll('iframe');

    Array.slice(iframes).forEach(function(iframe) {
      applyToFrames(iframe.contentWindow, event, method);
    });
  }

  function InputFocus(windowContext) {
    this.window = windowContext;

    // add focus listeners
    var onfocus = this.onfocus.bind(this);
    var onblur = this.onblur.bind(this);

    applyToFrames(windowContext, FOCUS, onfocus);
    applyToFrames(windowContext, BLUR, onblur);

  }

  InputFocus.prototype = {
    _focusTimer: null,

    onblur: function() {
      this.focusedElement = null;
    },

    onfocus: function(evt) {
      if (evt.target.window && evt.target === evt.target.window)
        return;

      if (this._focusTimer) {
        clearTimeout(this._focusTimer);
      }

      this.focusedElement = evt.target;

      this._focusTimer = setTimeout(
        this._focusCurrent.bind(this),
        FOCUS_TIME
      );
    },

    _findScrollable: function(node) {
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
    },

    _yAxisVisible: function(top, height, maxHeight) {
      if (top > 0 && (top + height) < maxHeight) {
        return true;
      }
      return false;
    },

    _scrollablesVisible: function(element, rect) {
      while ((element = this._findScrollable(element))) {
        if (element.window && element.self === element) {
          break;
        } else {
          var offset = element.getBoundingClientRect();
          var adjusted = {
            top: rect.top - offset.top,
            height: rect.height,
            width: rect.width
          };

          var visible = this._yAxisVisible(
            adjusted.top,
            adjusted.height,
            element.clientHeight
          );

          if (!visible)
            return false;

          element = element.parentNode;
        }
      }

      return true;
    },

    yAxisVisible: function(element) {
      // scrollable frames can be ignored we just care about iframes...
      var rect = element.getBoundingClientRect();
      var parent = element.ownerDocument.defaultView;

      var result = {
        top: rect.top - borderTop,
        height: rect.height,
        width: rect.width
      };

      var isVisible = true;

      do {
        var frame = parent.frameElement;

        if (isVisible) {
          isVisible = this._yAxisVisible(
            result.top,
            result.height,
            parent.innerHeight
          );

          isVisible = isVisible && this._scrollablesVisible(
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
    },

    _focusCurrent: function(element) {
      if (!this.focusedElement)
        return;

      var [visible, rect] = this.yAxisVisible(this.focusedElement);

      if (visible)
        return;

      if (rect.top > (this.window.innerHeight / 2)) {
        // align to bottom
        this.focusedElement.scrollIntoView(false);
      } else {
        // align to top
        this.focusedElement.scrollIntoView(true);
      }
    }
  };

  new InputFocus(window);

  return InputFocus;
}(this));
