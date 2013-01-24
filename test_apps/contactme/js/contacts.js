(function(window) {

  function debug(msg) {
    //dump('---*--- [contacts hack]: ' + String(msg) + '\n');
  }

  var performance = {
    contactsApi: 0
  };

  setInterval(function() {
    debug('[hack contacts] ' + JSON.stringify(performance) + ' \n');
  }, 5000);

  // begin contacts search
  var contactsRequest = navigator.mozContacts.find({
    sortBy: 'familyName'
  });

  // create the section template....
  var templateGroup = document.createElement('section');
  var templateGroupHeader = document.createElement('h1');
  templateGroup.appendChild(templateGroupHeader);

  // template for individual contact
  var templateContact = document.createElement('li');

  var Template = {

    group: function(headerTitle) {
      var element = templateGroup.cloneNode(true);
      element.children[0].textContent = headerTitle;

      return element;
    },

    contact: function(name) {
      var element = templateContact.cloneNode(true);
      element.textContent = name;

      return element;
    }
  };

  var View = {
    CHUNK: 200,

    get element() {
      if (!this._element) {
        this._element = document.getElementById('list');
      }
      return this._element;
    },

    render: function(all) {
      var target = this.element;
      var remaning = list.length;
      var offset = 0;

      function renderLoop() {
        var list = all.splice(0, View.CHUNK);
        var fragment = document.createDocumentFragment();

        debug(list.length + '-' + offset);
        offset += View.CHUNK;

        list.forEach(function(item) {
          var element = Template.contact(item.name.join());
          fragment.appendChild(element);
        });

        target.appendChild(fragment);

        if (all.length > 0)
          setTimeout(renderLoop);
      }

      renderLoop();
    },

  };

  var _start = Date.now();

  contactsRequest.onerror = function(e) {
    debug(e.target.error.name);
  };

  contactsRequest.onsuccess = function() {
    performance.contactsApi += (Date.now() - _start);
    View.render(contactsRequest.result);
  };

}(this));
