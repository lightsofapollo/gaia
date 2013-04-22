Calendar.ns('Utils').URI = (function() {

  var URI = {
    window: window,


    /**
     * Get the port of the url.
     * @param {string} url full url.
     * @return {?number} port number, null if none found.
     */
    getPort: function(url) {
      var parts = url.split(':');
      if (parts.length < 2) {
        return null;
      }

      // If we found a port and path, it's the last part
      var candidate = parts[parts.length - 1];
      parts = candidate.split('/');

      // If we found a port, it's the first part
      candidate = parts[0];
      if (!URI._isInteger(candidate)) {
        return null;
      }

      return parseInt(candidate, 10);
    },

    /**
     * Get the scheme of the url. Note that this only detects http and https.
     * @param {string} url full url.
     * @return {?string} uri scheme (ie http), null if none found.
     */
    getScheme: function(url) {
      var parts = url.split(':');
      if (parts.length < 2) {
        return null;
      }


      // If we found a scheme, it's the first part
      var candidate = parts[0];
      if (candidate !== 'http' && candidate !== 'https') {
        return null;
      }

      return candidate;
    },

    /**
     * Get the value for some urlparam by its string key.
     * @param {string} paramName The name of the key to look for.
     * @return {?string} Result will be the value as a string if the
     *     key exists, else null.
     */
    getParameterValue: function(paramName) {
      var search = this.window.location.search;
      if (search.length === 0) {
        return null;
      }

      var query = this.window.location.search.substring(1);
      var queryData = query.split('&');
      for (var i = 0; i < queryData.length; i++) {
        var pair = queryData[i].split('=');
        if (pair.length !== 2) {
          continue;
        }

        if (decodeURIComponent(pair[0]) === paramName) {
          return decodeURIComponent(pair[1]);
        }
      }

      return null;
    },

    /**
     * Decide whether or not this string represents an integer.
     * @param {string} str some string.
     * @param {boolean} whether or not str represents an integer.
     */
    _isInteger: function(str) {
      return /^\d+$/.test(str);
    }
  };

  return URI;

}());
