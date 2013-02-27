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

      'Views.Week': {
        group: [
          'Views.WeekChild',
          'Views.Day',
          'Templates.Week'
        ],

        js: [
          'views/week'
        ]
      },

      'Views.WeekChild': {
        group: [
          'Templates.Week',
          'Views.DayBased'
        ],

        js: [
          'views/week_child'
        ]
      },

      'Views.TimeHeader': {
        js: [
          'view',
          'views/time_header'
        ]
      },

      'Views.Settings': {
        group: ['Templates.Calendar'],

        js: [
          'view',
          'views/settings'
        ],

        style: ['settings']
      },

      'Views.MonthsDay': {
        group: ['Views.DayChild'],
        js: [
          'views/months_day'
        ]
      },

      'Views.Month': {
        group: [
          'Views.MonthChild',
          'Templates.Month',
          'Views.TimeParent'
        ],

        js: [
          'views/month'
        ]
      },

      'Views.MonthChild': {
        group: [
          'Templates.Month'
        ],

        js: [
          'calc',
          'views/month_child'
        ]
      },

      'Views.ModifyEvent': {
        group: ['Models.Event'],

        js: [
          'utils/input_parser',
          'views/modify_event'
        ],

        style: ['modify_event_view']
      },

      'Views.ModifyAccount': {
        js: [
          'view',
          'presets',
          'utils/account_creation',
          'models/account',
          'views/modify_account'
        ],

        style: ['modify_account_view']
      },

      'Views.Errors': {
        js: ['view', 'views/errors']
      },

      'Views.Day': {
        group: [
          'Views.TimeParent',
          'Views.DayChild'
        ],

        js: [
          'views/day'
        ]
      },

      'Views.DayChild': {
        group: ['Views.DayBased'],

        js: [
          'views/day_child'
        ]
      },

      'Views.DayBased': {
        group: ['Templates.Day'],

        js: [
          'calc',
          'utils/ordered_map',
          'utils/overlap',
          'view',
          'views/day_based'
        ]
      },

      'Views.TimeParent': {
        js: [
          'view',
          'utils/ordered_map',
          'views/time_parent'
        ]
      },

      'Views.CreateAccount': {
        group: ['Templates.Account'],

        js: [
          'views/create_account'
        ]
      },

      'Views.CalendarColors': {
        js: [
          'view',
          'models/calendar',
          'views/calendar_colors'
        ]
      },

      'Views.AdvancedSettings': {
        group: ['Templates.Account'],

        js: [
          'views/advanced_settings'
        ]
      },

      'Templates.Week': {
        js: [
          'template',
          'templates/week'
        ],

        style: ['week_view']
      },

      'Templates.Month': {
        js: [
          'template',
          'templates/month'
        ]
      },

      'Templates.Day': {
        js: [
          'template',
          'templates/day'
        ]
      },

      'Templates.Calendar': {
        // this is lame
        group: ['Provider.Local'],

        js: [
          'template',
          'templates/calendar'
        ]
      },

      'Templates.Account': {
        js: [
          'template',
          'templates/account'
        ]
      },


      'Provider.Local': {
        js: [
          'ext/uuid',
          'provider/abstract',
          'provider/local',
          'event_mutations'
        ]
      },

      'Provider.CaldavPullEvents': {
        js: ['provider/caldav_pull_events']
      },

      'Provider.Caldav': {
        js: [
          'provider/abstract',
          'provider/caldav',
          'provider/caldav_pull_events'
        ]
      },

      'Models.Account': {
        js: [
          'models/account'
        ]
      },

      'Models.Event': {
        js: ['models/event']
      },

      'Models.Calendar': {
        js: [
          'models/calendar'
        ]
      },

      'Controllers.RecurringEvents': {
        js: [
          'controllers/recurring_events'
        ]
      },

      'Controllers.Sync': {
        js: [
          'controllers/sync'
        ]
      },

      'Controllers.Service': {
        js: [
          'worker/manager',
          'controllers/service'
        ]
      },

      'Controllers.Alarm': {
        group: ['Models.Event'],
        js: [
          'controllers/alarm'
        ]
      }
    }
  };

  return config;
}());
