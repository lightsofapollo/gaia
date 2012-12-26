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

    focusElement: function(element) {
      if (!FormVisibility.isVisible(element)) {
        element.scrollIntoView(false);
      }
    },

    onfocus: function(evt) {
      if (evt.target.window && evt.target === evt.target.window)
        return;

      if (this._focusTimer) {
        clearTimeout(this._focusTimer);
      }

      this.focusedElement = evt.target;

      this._focusTimer = setTimeout(
        this.focusElement.bind(this, evt.target),
        FOCUS_TIME
      );
    },
  };

  let FormVisibility = {

    /**
     * Searches upwards in the DOM for a "scrollable" element or window.
     *
     * @param {HTMLElement} node element to start search at.
     * @return {Window|HTMLElement|Null} null when none are found window/element otherwise.
     */
    findScrollable: function fv_findScrollable(node) {
      let nodeContent = node.ownerDocument.defaultView;

      while (!(node instanceof HTMLBodyElement)) {
        let style = nodeContent.getComputedStyle(node, null);
        let overflow = [style.getPropertyValue('overflow'),
                        style.getPropertyValue('overflow-x'),
                        style.getPropertyValue('overflow-y')];

        if (overflow.indexOf('scroll') !== -1)
          return node;

        let rect = node.getBoundingClientRect();
        let isAuto = (overflow.indexOf('auto') != -1 &&
                     (rect.height < node.scrollHeight ||
                      rect.width < node.scrollWidth));


        if (isAuto)
          return node;

        node = node.parentNode;
      }

      if (nodeContent.scrollMaxX || nodeContent.scrollMaxY) {
        return nodeContent;
      }

      return null;
    },

    /**
     * Checks if "bottom" point of the position is visible.
     *
     * @param {Number} top position.
     * @param {Number} height of the element.
     * @param {Number} maxHeight of the window.
     * @return {Boolean} true when visible.
     */
    yAxisVisible: function fv_yAxisVisible(top, height, maxHeight) {
      return (top > 0 && (top + height) < maxHeight);
    },

    /**
     * Searches up through the dom for scrollable elements
     * which are not currently visible (relative to the viewport).
     *
     * @param {HTMLElement} element to start search at.
     * @param {Object} pos .top, .height and .width of element.
     */
    scrollablesVisible: function fv_scrollablesVisible(element, pos) {
      while ((element = this.findScrollable(element))) {
        if (element.window && element.self === element)
          break;

        let offset = element.getBoundingClientRect();
        let adjusted = {
          top: pos.top - offset.top,
          height: pos.height,
          width: pos.width
        };

        let visible = this.yAxisVisible(
          adjusted.top,
          adjusted.height,
          element.clientHeight
        );

        if (!visible)
          return false;

        element = element.parentNode;
      }

      return true;
    },

    /**
     * Verifies the element is visible in the viewport.
     * Handles scrollable areas, frames and scrollable viewport(s) (windows).
     *
     * @param {HTMLElement} element to verify.
     * @return {Boolean} true when visible.
     */
    isVisible: function fv_isVisible(element) {
      // scrollable frames can be ignored we just care about iframes...
      let rect = element.getBoundingClientRect();
      let parent = element.ownerDocument.defaultView;

      // used to calculate the inner position of frames / scrollables.
      let pos = {
        top: rect.top,
        height: rect.height,
        width: rect.width
      };

      let visible = true;

      do {
        let frame = parent.frameElement;
        visible = visible &&
                  this.yAxisVisible(pos.top, pos.height, parent.innerHeight) &&
                  this.scrollablesVisible(element, pos);

        if (frame) {
          let frameRect = frame.getBoundingClientRect();
          let top =
            parseInt(parent.getComputedStyle(frame, '').borderTopWidth, 10);

          pos.top += frameRect.top + top;
        }
      } while (
        (parent !== parent.parent) &&
        (parent = parent.parent)
      );

      return visible;
    }
  };

  new InputFocus(window);

  return InputFocus;
}(this));


