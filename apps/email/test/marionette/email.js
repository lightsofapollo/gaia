var client;

function Email(_client) {
  client = _client;
}
module.exports = Email;

Email.EMAIL_ORIGIN = 'app://email.gaiamobile.org';

const Selector = {
  notificationBar: '.card-message-list .msg-list-topbar',
  setupNameInput: '.card-setup-account-info .sup-info-name',
  setupEmailInput: '.card-setup-account-info .sup-info-email',
  setupPasswordInput: '.card-setup-account-info .sup-info-password',
  nextButton: '.sup-account-header .sup-info-next-btn',
  manualSetupNameInput: '.sup-manual-form .sup-info-name',
  manualSetupEmailInput: '.sup-manual-form .sup-info-email',
  manualSetupPasswordInput: '.sup-manual-form .sup-info-password',
  manualSetupImapUsernameInput: '.sup-manual-form .sup-manual-imap-username',
  manualSetupImapHostnameInput: '.sup-manual-form .sup-manual-imap-hostname',
  manualSetupImapPortInput: '.sup-manual-form .sup-manual-imap-port',
  manualSetupImapSocket: '.sup-manual-form .sup-manual-imap-socket',
  manualSetupSmtpUsernameInput: '.sup-manual-form .sup-manual-smtp-username',
  manualSetupSmtpHostnameInput: '.sup-manual-form .sup-manual-smtp-hostname',
  manualSetupSmtpPortInput: '.sup-manual-form .sup-manual-smtp-port',
  manualSetupSmtpSocket: '.sup-manual-form .sup-manual-smtp-socket',
  manualNextButton: '.sup-account-header .sup-manual-next-btn',
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

function _setupTypeName(name) {
  client.
    findElement(Selector.setupNameInput).
    sendKeys(name);
}

function _setupTypeEmail(email) {
  client.
    findElement(Selector.setupEmailInput).
    sendKeys(email);
}

function _setupTypePassword(password) {
  client.
    findElement(Selector.setupPasswordInput).
    sendKeys(password);
}

function _setupTapNext() {
  client.findElement(Selector.nextButton).tap();
}

function _manualSetupTypeName(name) {
  client.
    findElement(Selector.manualSetupNameInput).
    sendKeys(name);
}

function _manualSetupTypeEmail(email) {
  client.
    findElement(Selector.manualSetupEmailInput).
    sendKeys(email);
}

function _manualSetupTypePassword(password) {
  client.
    findElement(Selector.manualSetupPasswordInput).
    sendKeys(password);
}

function _manualSetupTypeImapUsername(name) {
  client.
    findElement(Selector.manualSetupImapUsernameInput).
    sendKeys(name);
}

function _manualSetupTypeImapHostname(hostname) {
  client.
    findElement(Selector.manualSetupImapHostnameInput).
    sendKeys(hostname);
}

function _manualSetupTypeImapPort(port) {
  var manualSetupImapPortInput =
      client.findElement(Selector.manualSetupImapPortInput);
  manualSetupImapPortInput.clear();
  manualSetupImapPortInput.sendKeys(port);
}

function _manualSetupTypeSmtpUsername(name) {
  client.
    findElement(Selector.manualSetupSmtpUsernameInput).
    sendKeys(name);
}

function _manualSetupTypeSmtpHostname(hostname) {
  client.
    findElement(Selector.manualSetupSmtpHostnameInput).
    sendKeys(hostname);
}

function _manualSetupTypeSmtpPort(port) {
  var manualSetupSmtpPortInput =
      client.findElement(Selector.manualSetupSmtpPortInput);
  manualSetupSmtpPortInput.clear();
  manualSetupSmtpPortInput.sendKeys(port);
}

/**
 * Because we never expose "plain" (zero security for users) as an option we
 * need to hack the html to expose it (the backend will know about this).
 */
function _manualSetupUpdateSocket(type) {
  var element = client.findElement(Selector[type]);

  // select is a real dom select element
  element.scriptWith(function(select) {
    // create the option
    var option = document.createElement('option');
    option.value = 'plain';
    select.add(option, select.options[select.options.length - 1]);

    // update the form to plain so we can use insecure sockets for the
    // fakeserver.
    select.value = 'plain';
  });
}

function _manualSetupTapNext() {
  client.
    findElement(Selector.manualNextButton).
    tap();
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
    const USER_NAME = 'GAIA';
    const EMAIL_ADDRESS = 'marionette.js.client@gmail.com';
    const PASSWORD = 'tpemozilla';
    // wait for the setup page is loaded
    client.helper.
      waitForElement(Selector.manualConfigButton);
    // setup a IMAP email account
    _setupTypeName(USER_NAME);
    _setupTypeEmail(EMAIL_ADDRESS);
    _setupTypePassword(PASSWORD);
    _setupTapNext();
    _waitForSetupCompleted();
    _tapContinue();
  },

  manualSetupImapEmail: function(server) {
    // wait for the setup page is loaded
    client.helper.
      waitForElement(Selector.manualConfigButton).
      tap();
    // setup a IMAP email account
    var email = server.imap.username + '@' + server.imap.hostname;
    _manualSetupTypeName(server.imap.username);
    _manualSetupTypeEmail(email);
    _manualSetupTypePassword(server.imap.password);

    _manualSetupTypeImapUsername(server.imap.username);
    _manualSetupTypeImapHostname(server.imap.hostname);
    _manualSetupTypeImapPort(server.imap.port);
    _manualSetupUpdateSocket('manualSetupImapSocket');

    _manualSetupTypeSmtpUsername(server.smtp.username);
    _manualSetupTypeSmtpHostname(server.smtp.hostname);
    _manualSetupTypeSmtpPort(server.smtp.port);
    _manualSetupUpdateSocket('manualSetupSmtpSocket');

    _manualSetupTapNext();
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
