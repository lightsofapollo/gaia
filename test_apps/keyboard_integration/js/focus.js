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

    _absOffset: function(element) {
      var win = element.ownerDocument.defaultView;
      var rect = element.getBoundingClientRect();
      var docEl = win.document.documentElement;

      return {
        top: rect.top + win.pageYOffset - docEl.clientTop,
        left: rect.left + win.pageXOffset - docEl.clientLeft,
        height: rect.height,
        width: rect.width
      };
    },

    _visibleOffset: function(win, rect) {
      var docEl = win.document.documentElement;

      var scrollX = win.scrollX;
      var scrollY = win.scrollY;

      var top = rect.top + win.pageYOffset - docEl.clientTop;
      var left = rect.left + win.pageXOffset - docEl.clientLeft;

      return {
        top: top - win.scrollY,
        left: left - win.scrollX,
        width: rect.width,
        height: rect.height
      };
    },

    _visible: function(rect, width, height) {
      var yVisible = false;
      var xVisible = false;

      if (rect.top > 0 && (rect.top + rect.height) < height) {
        yVisible = true;
      }

      if (rect.left > 0 && (rect.left + rect.width) < width) {
        xVisible = true;
      }

      return { left: xVisible, top: yVisible };
    },

    _focusCurrent: function(element, rect) {
      var scroll = element || this.focusedElement;

      if (!scroll) {
        console.log('no element to focus...');
        return;
      }

      rect = rect || scroll.getBoundingClientRect();

      var win = scroll.ownerDocument.defaultView;

      if (win && win.parent && win.frameElement) {
        var frameRect = win.frameElement.getBoundingClientRect();
        var adjustedRect = {
          top: frameRect.top + rect.top,
          left: frameRect.left + rect.left,
          height: rect.height,
          width: rect.width
        };

        this._focusCurrent(win.frameElement, adjustedRect);
      }

      while ((scroll = this._findScrollable(scroll))) {
        if (scroll.window && scroll.self === scroll) {
          var top = 0;
          var left = 0;

          var visible = this._visible(
            rect, scroll.innerWidth, scroll.innerHeight
          );

          if (!visible.top)
            top += rect.top;

          if (!visible.left)
            left += rect.left;

          scroll.scrollBy(left, top);

          break;
        } else {
          var offset = scroll.getBoundingClientRect();
          var adjusted = {
            left: rect.left - offset.left,
            top: rect.top - offset.top,
            height: rect.height,
            width: rect.width
          };

          var visible = this._visible(
            adjusted, scroll.clientWidth, scroll.clientHeight
          );

          if (!visible.top) {
            scroll.scrollTop += adjusted.top;
          }

          if (!visible.left) {
            scroll.scrollLeft += adjusted.left;
          }

          scroll = scroll.parentNode;
        }
      }
    }
  };

  new InputFocus(window);

  return InputFocus;
}(this));
