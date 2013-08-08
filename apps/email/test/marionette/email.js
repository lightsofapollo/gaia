var client;

function Email(_client) {
  client = _client;
}
module.exports = Email;

Email.EMAIL_ORIGIN = 'app://email.gaiamobile.org';
Email.USER_NAME = 'GAIA';
Email.EMAIL_ADDRESS = 'marionette.js.client@gmail.com';
Email.PASSWORD = 'tpemozilla';

const Selector = {
  notificationBar: '.card-message-list .msg-list-topbar',
  setupNameInput: '.card-setup-account-info .sup-info-name',
  setupEmailInput: '.card-setup-account-info .sup-info-email',
  setupPasswordInput: '.card-setup-account-info .sup-info-password',
  nextButton: '.sup-account-header .sup-info-next-btn',
  showMailButton: '.card-setup-done .sup-show-mail-btn',
  manualConfigButton: '.scrollregion-below-header .sup-manual-config-btn',
  composeButton: '.msg-list-header .msg-compose-btn',
  composeEmailInput: '.card-compose .cmp-addr-text',
  composeSubjectInput: '.card-compose .cmp-subject-text',
  composeBodyInput: '.card-compose .cmp-body-text',
  composeSendButton: '.card-compose .cmp-send-btn',
  refreshButton: '.card.center .msg-refresh-btn'
};

function _waitForTransitionEnd() {
  client.waitFor(function() {
    var condition = false;
    client.executeScript(
      function() {
        return window.wrappedJSObject.
                 require('mail_common').
                 Cards.
                 _eatingEventsUntilNextCard;
      },
      function(error, result) {
        if (result === false) {
          condition = true;
        }
      }
    );
    return condition;
  });
}

function _typeName(name) {
  client.
    findElement(Selector.setupNameInput).
    sendKeys(name);
}

function _typeEmail(email) {
  client.
    findElement(Selector.setupEmailInput).
    sendKeys(email);
}

function _typePassword(password) {
  client.
    findElement(Selector.setupPasswordInput).
    sendKeys(password);
}

function _tapNext() {
  client.findElement(Selector.nextButton).tap();
}

function _waitForSetupCompleted() {
  client.helper.waitForElement(Selector.showMailButton);
}

function _tapContinue() {
  client.findElement(Selector.showMailButton).tap();
}

Email.prototype = {
  get notificationBar() {
    return client.findElement(Selector.notificationBar);
  },

  setupImapEmail: function() {
    // wait for the setup page is loaded
    client.helper.
      waitForElement(Selector.manualConfigButton);
    // setup a IMAP email account
    _typeName(Email.USER_NAME);
    _typeEmail(Email.EMAIL_ADDRESS);
    _typePassword(Email.PASSWORD);
    _tapNext();
    _waitForSetupCompleted();
    _tapContinue();
  },

  tapCompose: function() {
    client.findElement(Selector.composeButton).tap();
    // wait for being in the compose page
    _waitForTransitionEnd();
  },

  typeTo: function(email) {
    client.
      findElement(Selector.composeEmailInput).
      sendKeys(email);
  },

  typeSubject: function(string) {
    client.
      findElement(Selector.composeSubjectInput).
      sendKeys(string);
  },

  typeBody: function(string) {
    client.
      findElement(Selector.composeBodyInput).
      sendKeys(string);
  },

  tapSend: function() {
    /*
     * We cannot tap the Selector.composeSendButton element with (0, 0) offset,
     * because the attachment button covers the left side of it a little bit.
     *
     * We could refer the css style in:
     * https://github.com/mozilla-b2g/gaia/blob/master/shared/style/headers.css#L117
     * And the patch in http://bugzil.la/907061 make us skip the issue luckily.
     *
     * We discuss and fix the issue in http://bugzil.la/907092
     */
    client.
      findElement(Selector.composeSendButton).
      tap();
    // wait for being in the email list page
    client.helper.waitForElement(Selector.refreshButton);
    _waitForTransitionEnd();
  },

  waitForNewEmail: function() {
    client.
      findElement(Selector.refreshButton).
      tap();
    // show a new email notification
    client.helper.waitForElement(Selector.notificationBar);
  },

  launch: function() {
    client.apps.launch(Email.EMAIL_ORIGIN);
    client.apps.switchToApp(Email.EMAIL_ORIGIN);
    // wait for the document body to know we're really launched
    client.helper.waitForElement('body');
  }
};
