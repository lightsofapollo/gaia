(function(window) {

  window._startCamera = Date.now();

  function handlePending() {
    while ((callback = Hardware._pending.shift())) {
      callback(Hardware._current);
    }
  }

  var Hardware = {

    _cameras: null,

    _pending: [],

    _idx: null,

    /**
     * Current camera object
     */
    _current: null,

    /**
     * Get the current camera
     *
     * @param {Numeric} index of camera to use.
     * @param {Function} callback [camera].
     */
    get: function(idx, callback) {
      if (callback)
        this._pending.push(callback);

      this._cameras = navigator.mozCameras.getListOfCameras();
      var options = {camera: this._cameras[idx]};

      if (idx === this._idx) {
        setTimeout(handlePending, this._current);
      } else {
        navigator.mozCameras.getCamera(options, function handleCamera(camera) {
          Hardware._current = camera;
          Hardware._idx = idx;
          handlePending(camera);
        });
      }

      return this._cameras;
    }

  };

  Hardware.get(0); // get first camera and initialize it

  window.CameraHardware = Hardware;

}(this));
