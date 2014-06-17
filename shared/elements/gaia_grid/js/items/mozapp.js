'use strict';
/* global GaiaGrid */
/* global UrlHelper */
/* global Promise */

(function(exports) {

  const IDENTIFIER_SEP = '-';

  var _ = navigator.mozL10n.get;

  /**
   * Represents  single app icon on the homepage.
   */
  function Mozapp(app, entryPoint, details) {
    this.app = app;
    this.entryPoint = entryPoint;

    this.detail = {
      type: 'app',
      manifestURL: app.manifestURL,
      entryPoint: entryPoint,
      index: 0,
      // XXX: Somewhat ugly hack around the constructor args
      defaultIconBlob: details && details.defaultIconBlob
    };

    // Re-render on update
    // XXX: This introduces a potential race condition. GridItem.renderIcon is
    // not concurrency safe one image may override another without ordering.
    this.app.ondownloadapplied =
      GaiaGrid.GridItem.prototype.renderIcon.bind(this);
  }

  Mozapp.prototype = {

    __proto__: GaiaGrid.GridItem.prototype,

    /**
     * Returns the height in pixels of each icon.
     */
    get pixelHeight() {
      return this.grid.layout.gridItemHeight;
    },

    /**
     * Width in grid units for each icon.
     */
    gridWidth: 1,

    get name() {
      var userLang = document.documentElement.lang;

      var locales = this.descriptor.locales;
      var localized = locales && locales[userLang] && locales[userLang].name;

      return localized || this.descriptor.name;
    },

    _icon: function() {
      var icons = this.descriptor.icons;
      if (!icons) {
        return this.defaultIcon;
      }

      // Create a list with the sizes and order it by descending size
      var list = Object.keys(icons).map(function(size) {
        return size;
      }).sort(function(a, b) {
        return b - a;
      });

      var length = list.length;
      if (length === 0) {
        // No icons -> icon by default
        return this.defaultIcon;
      }

      var maxSize = this.grid.layout.gridMaxIconSize; // The goal size
      var accurateSize = list[0]; // The biggest icon available
      for (var i = 0; i < length; i++) {
        var size = list[i];

        if (size < maxSize) {
          break;
        }

        accurateSize = size;
      }

      var icon = icons[accurateSize];

      // Handle relative URLs
      if (!UrlHelper.hasScheme(icon)) {
        var a = document.createElement('a');
        a.href = this.app.origin;
        icon = a.protocol + '//' + a.host + icon;
      }

      return icon;
    },

    /**
     * Returns the icon image path.
     */
    get icon() {
      var icon = this.accurateMozapp;

      if (!icon) {
        icon = this.accurateMozapp = this._icon();
      }

      return icon;
    },

    get descriptor() {
      var manifest = this.app.manifest || this.app.updateManifest;

      if (this.entryPoint) {
        return manifest.entry_points[this.entryPoint];
      }
      return manifest;
    },

    identifierSeparator: IDENTIFIER_SEP,

    get identifier() {
      var identifier = [this.app.manifestURL];

      if (this.entryPoint) {
        identifier.push(this.entryPoint);
      }

      return identifier.join(IDENTIFIER_SEP);
    },

    /**
     * Returns true if this app is removable.
     */
    isRemovable: function() {
      return this.app.removable;
    },

    fetchIconBlob: function() {
      var _super = GaiaGrid.GridItem.prototype.fetchIconBlob.bind(this);
      if (!this.app.downloading) {
        return _super();
      }

      // show the spinner while the app is downloading!
      this.showDownloading();
      this.app.onprogress = this.showDownloading.bind(this);

      // XXX: This is not safe if some upstream consumer wanted to listen to
      //      these events we just clobbered them.
      return new Promise((accept, reject) => {
        this.app.ondownloadsuccess = this.app.ondownloaderror = () => {
          _super().
            then((blob) => {
              this.hideDownloading();
              accept(blob);
            }).
            catch((e) => {
              this.hideDownloading();
              reject(e);
            });
        };
      });
    },

    cancel: function() {
      console.log('show cancel~>~>~');
      var dialog = new GaiaGrid._Dialog({
        title: _('stop-download-title', { name: this.name }),
        body: _('stop-download-body'),
        cancel: {
          title: _('cancel')
        },
        confirm: {
          title: _('stop-download-action'),
          type: 'danger',
          cb: () =>  this.app.cancelDownload()
        }
      });
      dialog.show(this.grid.element);
    },

    resume: function() {
      var dialog = new GaiaGrid._Dialog({
        title: _('resume-download-title'),
        body: _('resume-download-body', { name: this.name }),
        cancel: {
          title: _('cancel')
        },
        confirm: {
          title: _('resume-download-action'),
          cb: () => this.app.download()
        }
      });
    },

    /**
     * Resolves click action.
     */
    launch: function() {
      return this.cancel();
      var app = this.app;
      if (app.downloading) {
        this.cancel();
      } else if (app.downloadAvailable) {
        this.resume();
      } else if (this.entryPoint) {
        app.launch(this.entryPoint);
      } else {
        app.launch();
      }
    },

    /**
     * Uninstalls the application.
     */
    remove: function() {
      window.dispatchEvent(new CustomEvent('gaiagrid-uninstall-mozapp', {
        'detail': this
      }));
    },

    showDownloading: function() {
      this.element.classList.add('loading');
    },

    hideDownloading: function() {
      this.element.classList.remove('loading');
    }
  };

  exports.GaiaGrid.Mozapp = Mozapp;

}(window));
