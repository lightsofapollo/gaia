(function(window) {

  var DEFAULT_AUTH_TYPE = 'basic';
  var OAUTH_AUTH_CREDENTIALS = [
    'client_id',
    'scope',
    'redirect_uri',
    'state'
  ];

  function ModifyAccount(options) {
    Calendar.View.apply(this, arguments);

    this.deleteRecord = this.deleteRecord.bind(this);
    this.cancel = this.cancel.bind(this);

    this.accountHandler = new Calendar.Utils.AccountCreation(
      this.app
    );

    this.accountHandler.on('authorizeError', this);

    // bound so we can add remove listeners
    this._boundSaveUpdateModel = this.save.bind(this, { updateModel: true });
  }

  ModifyAccount.prototype = {
    __proto__: Calendar.View.prototype,

    selectors: {
      element: '#modify-account-view',
      form: '#modify-account-view form',
      fields: '*[name]',
      saveButton: '#modify-account-view .save',
      deleteButton: '#modify-account-view .delete-confirm',
      cancelDeleteButton: '#modify-account-view .delete-cancel',
      backButton: '#modify-account-view .cancel',
      status: '#modify-account-view section[role="status"]',
      errors: '#modify-account-view .errors',
      oauth2Window: '#oauth2'
    },

    progressClass: 'in-progress',

    get authenticationType() {
      if (this.preset && this.preset.authenticationType)
        return this.preset.authenticationType;

      return DEFAULT_AUTH_TYPE;
    },

    get oauth2Window() {
      return this._findElement('oauth2Window');
    },

    get deleteButton() {
      return this._findElement('deleteButton');
    },

    get cancelDeleteButton() {
      return this._findElement('cancelDeleteButton');
    },

    get backButton() {
      return this._findElement('backButton');
    },

    get saveButton() {
      return this._findElement('saveButton');
    },

    get form() {
      return this._findElement('form');
    },

    get fields() {
      if (!this._fields) {
        var result = this._fields = {};
        var elements = this.element.querySelectorAll(
          this.selectors.fields
        );

        var i = 0;
        var len = elements.length;

        for (i; i < len; i++) {
          var el = elements[i];
          result[el.getAttribute('name')] = el;
        }
      }

      return this._fields;
    },

    handleEvent: function(event) {
      var type = event.type;
      var data = event.data;

      switch (type) {
        case 'authorizeError':
          // we only expect one argument an error object.
          this.showErrors(data[0]);
          break;
      }
    },

    updateForm: function() {
      var update = ['user', 'fullUrl'];

      update.forEach(function(name) {
        var field = this.fields[name];
        field.value = this.model[name];
      }, this);
    },

    updateModel: function() {
      var update = ['user', 'password', 'fullUrl'];

      update.forEach(function(name) {
        var field = this.fields[name];
        this.model[name] = field.value;
      }, this);
    },

    deleteRecord: function() {
      var app = this.app;
      var id = this.model._id;
      var store = app.store('Account');

      store.remove(id, function() {
        // semi-hack clear the :target - harmless in tests
        // but important in the current UI because css :target
        // does not get cleared (for some reason)
        window.location.replace('#');

        // TODO: in the future we may want to store the entry
        // url of this view and use that instead of this
        // hard coded value...
        app.router.show('/advanced-settings/');
      });
    },

    cancel: function(event) {
      if (event) {
        event.preventDefault();
      }

      window.back();
    },

    save: function(options) {
      var list = this.element.classList;
      var self = this;

      if (this.app.offline()) {
        this.showErrors([{name: 'offline'}]);
        return;
      }

      list.add(this.progressClass);

      this.errors.textContent = '';

      if (options && options.updateModel)
        this.updateModel();

      this.accountHandler.send(this.model, function(err) {
        list.remove(self.progressClass);
        if (!err) {
          self.app.go(self.completeUrl);
        }
      });
    },

    /**
     * @param {String} preset name of value in Calendar.Presets.
     */
    _createModel: function(preset, callback) {
      var settings = Calendar.Presets[preset];
      var model = new Calendar.Models.Account(
        settings.options
      );

      model.preset = preset;
      return model;
    },

    /**
     * @param {String} id account id.
     */
    _updateModel: function(id, callback) {
      var store = this.app.store('Account');
      var self = this;

      return store.cached[id];
    },

    _redirectToOAuthFlow: function() {
      var apiCredentials = this.preset.apiCredentials;
      var params = {
        /*
         * code response type for now might change when we can use window.open
         */
        response_type: 'code',
        /* offline so we get refresh_token[s] */
        access_type: 'offline',
        /* we us force so we always get a refresh_token */
        approval_prompt: 'force'
      };

      OAUTH_AUTH_CREDENTIALS.forEach(function(key) {
        if (key in apiCredentials) {
          params[key] = apiCredentials[key];
        }
      });

      var oauth = this._oauthDialog = new Calendar.OAuthWindow(
        this.oauth2Window,
        apiCredentials.authorizationUrl,
        params
      );

      var self = this;

      oauth.open();
      oauth.onabort = function() {
        self.cancel();
      };

      oauth.oncomplete = function(params) {
        if (!params.code) {
          return console.error('authentication error');
        }
        self.model.oauth = { code: params.code };
        self.save();
      };
    },

    render: function() {
      if (!this.model) {
        throw new Error('must provider model to ModifyAccount');
      }

      this.saveButton.addEventListener('click', this._boundSaveUpdateModel);
      this.backButton.addEventListener('click', this.cancel);

      if (this.model._id) {
        this.type = 'update';
        this.deleteButton.addEventListener('click', this.deleteRecord);
        this.cancelDeleteButton.addEventListener('click',
                                                 this.cancel);
      } else {
        this.type = 'create';
      }

      var list = this.element.classList;
      list.add(this.type);
      list.add('preset-' + this.model.preset);
      list.add('provider-' + this.model.providerType);
      list.add('auth-' + this.authenticationType);

      if (this.authenticationType === 'oauth2') {
        if (this.type === 'create') {

          // show the dialog immediately
          this.oauth2Window.classList.add(Calendar.View.ACTIVE);

          // but lazy load the real objects we need.
          if (Calendar.OAuthWindow)
            return this._redirectToOAuthFlow();

          return Calendar.App.loadObject(
            'OAuthWindow', this._redirectToOAuthFlow.bind(this)
          );
        }

        this.fields.user.disabled = true;
        this.saveButton.disabled = true;
      }

      this.form.reset();
      this.updateForm();
    },

    destroy: function() {
      var list = this.element.classList;

      list.remove(this.type);

      list.remove('preset-' + this.model.preset);
      list.remove('provider-' + this.model.providerType);
      list.remove('auth-' + this.authenticationType);

      this.fields.user.disabled = false;
      this.saveButton.disabled = false;

      this._fields = null;
      this.form.reset();

      this.saveButton.removeEventListener('click', this._boundSaveUpdateModel);
      this.deleteButton.removeEventListener('click', this.deleteRecord);
      this.cancelDeleteButton.removeEventListener('click',
                                                  this.cancel);
      this.backButton.removeEventListener('click',
                                                this.cancel);
    },

    dispatch: function(data) {
      if (this.model)
        this.destroy();

      var provider;
      var autoSubmit;
      var params = data.params;
      this.completeUrl = '/settings/';
      var self = this;

      if (params.id) {
        displayModel(null, this._updateModel(params.id));
      } else if (params.preset) {
        displayModel(null, this._createModel(params.preset));
      }

      function displayModel(err, model) {
        self.preset = Calendar.Presets[model.preset];
        if (err) {
          console.log(
            'Error displaying model in ModifyAccount',
            data
          );
          return;
        }

        self.model = model;
        provider = self.app.provider(model.providerType);
        self.render();
      };
    },

    oninactive: function() {
      Calendar.View.prototype.oninactive.apply(this, arguments);

      if (this._oauthDialog) {
        this._oauthDialog.close();
        this._oauthDialog = null;
      }
    }

  };

  Calendar.ns('Views').ModifyAccount = ModifyAccount;

}(this));
