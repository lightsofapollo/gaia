let FormVisibility = {

  /**
   * Searches upwards in the DOM for an element that has been scrolled.
   *
   * @param {HTMLElement} node element to start search at.
   * @return {Window|HTMLElement|Null} null when none are found window/element otherwise.
   */
  findScrolled: function fv_findScrolled(node) {
    let win = node.ownerDocument.defaultView;

    while (!(node instanceof HTMLBodyElement)) {

      // We can skip elements that have not been scrolled.
      // We only care about top now remember to add the scrollLeft
      // check if we decide to care about the X axis.
      if (node.scrollTop !== 0) {
        // the element has been scrolled so we may need to adjust
        // where we think the root element is located.
        //
        // Otherwise it may seem visible but be scrolled out of the viewport
        // inside this scrollable node.
        return node;
      } else {
        // this node does not effect where we think
        // the node is even if it is scrollable it has not hidden
        // the element we are looking for.
        node = node.parentNode;
        continue;
      }
    }

    // we also care about the window this is the more
    // common case where the content is larger then
    // the viewport/screen.
    if (win.scrollMaxX || win.scrollMaxY) {
      return win;
    }

    return null;
  },

  /**
   * Checks if "top  and "bottom" points of the position is visible.
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
    while ((element = this.findScrolled(element))) {
      if (element.window && element.self === element)
        break;

      // remember getBoundingClientRect does not care
      // about scrolling only where the element starts
      // in the document.
      let offset = element.getBoundingClientRect();

      // the top of both the scrollable area and
      // the form element itself are in the same document.
      // We  adjust the "top" so if the elements coordinates
      // are relative to the viewport in the current document.
      let adjustedTop = pos.top - offset.top;

      let visible = this.yAxisVisible(
        adjustedTop,
        pos.height,
        pos.width
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
    // The intent was to use this information to scroll either up or down.
    // scrollIntoView(true) will _break_ some web content so we can't do
    // this today. If we want that functionality we need to manually scroll
    // the individual elements.
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

      // nothing we can do about this now...
      // In the future we can use this information to scroll
      // only the elements we need to at this point as we should
      // have all the details we need to figure out how to scroll.
      if (!visible)
        return false;

      if (frame) {
        let frameRect = frame.getBoundingClientRect();

        pos.top += frameRect.top + frame.clientTop;
      }
    } while (
      (parent !== parent.parent) &&
      (parent = parent.parent)
    );

    return visible;
  }
};


