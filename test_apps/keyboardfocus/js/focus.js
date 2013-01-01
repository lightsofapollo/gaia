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

  new InputFocus(window);

  return InputFocus;
}(this));


