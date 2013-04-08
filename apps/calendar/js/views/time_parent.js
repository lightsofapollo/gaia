Calendar.ns('Views').TimeParent = (function() {

  var XSWIPE_OFFSET = window.innerWidth / 10;
  var CURRENT = 'current';

  /**
   * Parent view for busytime-based views
   * (month, week, day) contains basic
   * handlers for purging frames, panning, etc...
   *
   * Each "child" must be added to frames.
   * Each child must be identified by some id.
   *
   * Child classes are expected to have "create"
   * method and "destroy" methods for adding &
   * removing them from the dom.
   */
  function TimeParent() {
    Calendar.View.apply(this, arguments);
    this.frames = new Calendar.Utils.OrderedMap();
    this._initEvents();
  }

  TimeParent.prototype = {
    __proto__: Calendar.View.prototype,

    /**
     * Maximum number of child elements to keep
     * around until we start removing them.
     */
    maxFrames: 5,

    get frameContainer() {
      return this.element;
    },

    _initEvents: function() {
      this.app.timeController.on('purge', this);
      this.element.addEventListener('swipe', this);

      this.gd = new GestureDetector(this.element);
      this.gd.startDetecting();

      var events = [
        'mousedown', 'mouseup', 'mousemove',
        'touchstart', 'touchend', 'touchmove'
      ];

      events.forEach(function(event) {
        this.element.addEventListener(event, function(e) {
          e.preventDefault();
          e.stopPropagation();
        });
      }, this);

    },

    _onswipe: function(data) {
      if (
          !this._swipePending &&
          Math.abs(data.dy) > (Math.abs(data.dx) - XSWIPE_OFFSET) &&
          (data.direction === 'left' || data.direction === 'right')
      ) {
        return;
      }



      var controller = this.app.timeController;

      /*
        animations steps:

          if left
            add class "next-frame"
          if right
            add class "previous-frame"

          add animation class to body

          wait for _both_ animations to complete then remove
          animations class.

          (current should always be set to 0%)

         // set current time

      */
     var type = (data.direction === 'left') ? 'next' : 'previous';
     var containerClassName = 'transition-frames-' + data.direction;
     this._swipePending = true;

     console.log(containerClassName, '<--- KLASS NAME');

     var fromFrame = this.currentFrame;
     var toFrame = this.frames.adjacent(
       this.currentFrame.id,
       (type === 'next') ? 1 : -1
     );


     var pending = 2;
     function next(e) {
       console.log(e.target.classNames, pending, '<-- HIT!');
       if (--pending === 0) {
         realMove();
       }
     }

     toFrame.element.addEventListener('transitionend', next);
     fromFrame.element.addEventListener('transitionend', next);

     toFrame.element.classList.add('next-frame');
     fromFrame.element.classList.add('previous-frame');

     Calendar.nextTick(function() {
       this.frameContainer.classList.add(containerClassName);
     }.bind(this));

     toFrame.activate();
     var realMove = function() {
       this._swipePending = false;

       // real move
       //controller.move(this['_' + type + 'Time'](this.date));

       fromFrame.element.classList.remove('previous-frame');
       toFrame.element.classList.remove('next-frame');
       // remove classes and listeners
       toFrame.element.removeEventListener('transitionend', next);
       fromFrame.element.removeEventListener('transitionend', next);

       this.frameContainer.classList.remove(containerClassName);
      }.bind(this);
    },

    /**
     * Find a frame near the current frame.
     *
     *    // next frame
     *    parent.adjacentFrame(1);
     *
     *    // previous frame
     *    parent.adjacentFrame(-1);
     *
     *
     * @param {Numeric} relativePosition distance from current frame.
     * @return {Object|Null} frame or null.
     */
    adjacentFrame: function(relativePosition) {
      var idx = this.frames.indexOf(this.currentFrame.id);

      idx += relativePosition;

      return this.frames.items[idx] || null;
    },

    handleEvent: function(e) {
      switch (e.type) {
        case 'swipe':
          this._onswipe(e.detail);
          break;
        case 'purge':
          this.purgeFrames(e.data[0]);
          break;
      }
    },

    /**
     * Creates a single 'frame' for the parent.
     * A frame can be any object with the following capabilities;
     *
     *    - element: property that contains a dom element
     *               that has yet to be inserted into the document.
     *
     *    - timespan: a timespan object for purge events.
     *
     *    - activate: a method to activate the frame.
     *
     *    - deactivate: a method to deactivate the frame.
     *
     *    - destroy: a method to destroy the frame.
     *
     *
     * The default behaviour of this method is to use
     * the 'childClass' property to create an object
     * to use as the frame. In day/month cases the frame
     * can be the child class directly.
     *
     * @param {Date} date frame time.
     */
    _createFrame: function(date) {
      /** default childClass implementation */
      var child = new this.childClass({
        app: this.app,
        date: date
      });
      child.create();
      return child;
    },

    _nextTime: function() {},
    _previousTime: function() {},

    _getId: function(date) {
      return date.valueOf();
    },

    /**
     * Removes extra frames when frames.length > maxFrames.
     */
    _trimFrames: function() {
      var frames = this.frames;
      var keep;

      if (frames.length > this.maxFrames) {
        // determine splice size
        var idx = frames.indexOf(this.currentFrame.id);
        idx = (idx - 1) || 0;

        // remove the ones we want to keep from the original list.
        // 3 here is not a magic number but the original + prev + next (3)
        keep = frames.items.splice(idx, 3);
        var deleteFrames = frames.items;

        // destroy the rest
        idx = 0;
        var len = deleteFrames.length;
        for (; idx < len; idx++) {
          deleteFrames[idx][1].destroy();
        }

        // replace the .items array with the ones we kept.
        frames.items = keep;
      }
    },

    /**
     * Adds a frame for the given time.
     *
     * @param {Date} date time to add frame for.
     * @return {Object} existing or newly added frame.
     */
    addFrame: function(date) {
      var frame;
      var id = this._getId(date);
      var frame = this.frames.get(id);
      if (!frame) {
        frame = this._createFrame(date);
        this.frames.set(id, frame);

        // XXX: look into correctly positioning
        //      elements by their viewing order.
        this.frameContainer.appendChild(
          frame.element
        );
      }

      return frame;
    },

    /**
     * Changes date of the parent frame.
     *
     * @param {Date} time center point to activate.
     */
    changeDate: function(time) {
      // deactivate previous frame
      if (this.currentFrame) {
        this.currentFrame.deactivate();
      }

      this.date = time;

      // setup & find all ids
      var next = this._nextTime(time);
      var prev = this._previousTime(time);

      // add previous frame
      prev = this.addFrame(prev);

      // create & activate current frame
      var cur = this.currentFrame = this.addFrame(time);
      cur.activate();

      // add next frame
      this.addFrame(next);

      // ensure we don't have too many extra frames.
      this._trimFrames();
    },

    /**
     *
     * @param {Calendar.Timespan} timespan span of time.
     */
    purgeFrames: function(span) {
      var key;
      var child;
      var i = 0;
      var len = this.frames.length;

      var offset = 0;

      for (; i < len; i++) {
        child = this.frames.items[i - offset][1];
        if (span.contains(child.timespan)) {
          // Bug 827249 - remove current frame when its purged.
          if (this.currentFrame === child) {
            this.currentFrame = null;
          }

          child.destroy();
          this.frames.items.splice(i - offset, 1);
          offset += 1;
        }
      }
    },

    onactive: function() {
      Calendar.View.prototype.onactive.apply(
        this, arguments
      );

      if (this.app && this.scale) {
        this.app.timeController.scale = this.scale;
      }
    }
  };

  return TimeParent;


}());
