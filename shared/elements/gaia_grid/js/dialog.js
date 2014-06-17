(function(exports) {
  /**
  Generic lazily loaded used in particular for mozapp error states.
  */
  function Dialog(config) {
    this.config = config;
  }

  Dialog.prototype = {
    handleEvent: function(e) {
      // ensure we hide the dialog in the face of other errors...
      this.destroy();

      switch (e.type) {
        case 'confirm':
          var confirm = config.confirm.cb;
          confirm && confirm();
          break;
        case 'cancel':
          var cancel = config.cancel.cb;
          cancel && cancel();
          break;
      }
    },

    destroy: function() {
      if (this.element) {
        // ensure cleanup of our hacks!
        window.removeEventListener('hashchange', this);

        this.element.parentNode.removeChild(this.element);
        this.element = null;
      }
    },

    show: function(parent) {
      var element = document.createElement('gaia-confirm');
      element.setAttribute('id', 'confirm-message');
      element.innerHTML =
        '<h1 id="confirmation-message-title"></h1>' +
        '<p id="confirmation-message-body"></p>' +
        '<gaia-buttons skin="dark">' +
          '<button data-type="cancel" class="cancel" id="confirmation-message-cancel" type="button"></button>' +
          '<button data-type="confirm" class="confirm" id="confirmation-message-ok" type="button"></button>' +
        '</gaia-buttons>';

      parent.appendChild(element);
      this.element = element;
      element.addEventListener('confirm', this);
      element.addEventListener('cancel', this);

      // XXX: Is this a massive hack?
      window.addEventListener('hashchange', this);

      var title = element.querySelector('h1'),
          body = element.querySelector('p'),
          cancel = element.querySelector('.cancel'),
          confirm = element.querySelector('.confirm');

      title.textContent = this.config.title;
      body.textContent = this.config.body;
      cancel.textContent = this.config.cancel.title;
      confirm.textContent = this.config.confirm.title;

      if (this.config.confirm.type) {
        confirm.classList.add(this.config.confirm.type);
      }
    }
  };

  // _ = private don't use this class
  window.GaiaGrid._Dialog = Dialog;
}(window));
