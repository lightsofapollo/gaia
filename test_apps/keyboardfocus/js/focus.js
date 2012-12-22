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
            left: rect.left - offset.left,
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
        top: rect.top,
        left: rect.left,
        height: rect.height,
        width: rect.width
      };

      var isVisible = this._yAxisVisible(
        rect.top,
        rect.height,
        parent.innerHeight
      );

      isVisible = isVisible && this._scrollablesVisible(
        element, result
      );

      for (; parent !== parent.parent; parent = parent.parent) {
        var frame = parent.frameElement;
        if (frame) {
          var frameRect = frame.getBoundingClientRect();
          var left =
            parent.getComputedStyle(frame, '').borderLeftWidth;

          var top =
            parent.getComputedStyle(frame, '').borderTopWidth;

          result.left += frameRect.left + parseInt(left, 10);
          result.top += frameRect.top + parseInt(top, 10);

          if (isVisible) {
            isVisible = this._yAxisVisible(
              result.top,
              result.height,
              parent.innerHeight
            );
          }
        }

        if (isVisible) {
          this._scrollablesVisible(element, result);
        }
      }

      return [isVisible, result];
    },

    _focusCurrent: function(element, rect) {
      if (!this.focusedElement)
        return;

      var [visible, rect] = this.yAxisVisible(this.focusedElement)

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
