Calendar.LoadConfig = (function() {

  var SNAKE = /(_|\/)([a-zA-Z])/g;
  var SLASH = /\//g;

  /**
   * Convert a string from snake_case to camelCase.
   */
  function camelize(str) {
    str = str.replace(SNAKE, function(value) {
      // we want to trim the underscores
      if (value[0] === '_') {
        return value[1].toUpperCase();
      } else {
        // but keep the slashes
        return value.toUpperCase();
      }
    });

    str = str[0].toUpperCase() + str.slice(1);
    return str.replace(SLASH, '.');
  }

  function loadScript(source, cb) {
    var el = document.createElement('script');
    el.src = source;
    el.type = 'text/javascript';

    // important otherwise scripts will load out of order.
    el.async = false;

    el.onerror = function scriptError(err) {
      cb(new Error('could not load script "' + source + '"'));
    };

    el.onload = function scriptLoad() {
      cb();
    };

    document.head.appendChild(el);
  }

  function loadStylesheet(source, cb) {
    var el = document.createElement('link');
    el.href = source;
    el.rel = 'stylesheet';
    el.type = 'text/css';

    el.onerror = function stylesheetError(err) {
      cb(new Error('could not load stylesheet "' + source + '"'));
    };

    el.onload = function stylesheetLoad() {
      cb();
    };

    document.head.appendChild(el);
  }

  var config = {
    jsRoot: '/js/',
    styleRoot: '/style/',
    sharedJsRoot: '/shared/js/',
    sharedStyleRoot: '/shared/style/',
    storeRoot: 'store/',

    plugins: {
      js: function lc_importJS(file, obs, cb) {
        var name = camelize(file);
        var existsInPage = Calendar.ns(name, true);

        // already loaded skip
        if (existsInPage) {
          setTimeout(cb, 0);
          return;
        }

        var file = this.config.jsRoot + file + '.js';

        loadScript(file, cb);
      },

      style: function lc_importStylesheet(file, obs, cb) {
        var file = this.config.styleRoot + file + '.css';
        loadStylesheet(file, cb);
      },

      storeLoad: function lc_loadStore(file, obs, cb) {
        var name = camelize(file);
        file = this.config.storeRoot + file;

        this.load('js', file, function() {
          var store = Calendar.App.store(name);
          if (!store) {
            cb(new Error(
              'failed to execute storeLoad for "' + name + '". ' +
              'Store is missing...'
            ));
          }

          // preload the store...
          store.load(cb);
        });
      }
    },

    group: {
    }
  };

  return config;
}());
