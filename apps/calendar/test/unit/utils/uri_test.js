requireLib('utils/uri.js');

suite('uri', function() {
  suite('#getPort', function() {
    test('with port', function() {
      var port = Calendar.Utils.URI.getPort('lolcats.com:1337');
      assert.deepEqual(1337, port);
    });

    test('without port', function() {
      var port = Calendar.Utils.URI.getPort('https://lolcats.com/index.html');
      assert.deepEqual(null, port);
    });

    test('with port and path', function() {
      var port = Calendar.Utils.URI.getPort('lolcats.com:1337/index.html');
      assert.deepEqual(1337, port);
    });
  });

  suite('#getScheme', function() {
    test('http', function() {
      var scheme = Calendar.Utils.URI.getScheme('http://lolcats.com');
      assert.deepEqual('http', scheme);
    });

    test('http with port', function() {
      var scheme = Calendar.Utils.URI.getScheme('http://lolcats.com:1337');
      assert.deepEqual('http', scheme);
    });

    test('https', function() {
      var scheme = Calendar.Utils.URI.getScheme('https://lolcats.com');
      assert.deepEqual('https', scheme);
    });

    test('https with port', function() {
      var scheme = Calendar.Utils.URI.getScheme('https://lolcats.com:443');
      assert.deepEqual('https', scheme);
    });

    test('no scheme', function() {
      var scheme = Calendar.Utils.URI.getScheme('lolcats.com');
      assert.deepEqual(null, scheme);
    });

    test('no scheme with port', function() {
      var scheme = Calendar.Utils.URI.getScheme('lolcats.com:1337');
      assert.deepEqual(null, scheme);
    });

    test('unsupported scheme', function() {
      var scheme = Calendar.Utils.URI.getScheme('smb://lolcats.com');
      assert.deepEqual(null, scheme);
    });
  });

  // TODO(gareth): Turn this on once we have some way to mock out
  // window.location.search
  // suite('#getParameterValue', function() {
  //   var sinon = window.sinon;
  //   var stub;

  //   teardown(function() {
  //     stub.restore();
  //   });

  //   test('no search', function() {
  //     stub = sinon.stub(window.location, 'search', function() {
  //       return '';
  //     });

  //     var paramValue = Calendar.Utils.URI.getParameterValue('returnTop');
  //     assert.deepEqual(null, paramValue);
  //   });

  //   test('param not found', function() {
  //     stub = sinon.stub(window.location, 'search', function() {
  //       return '?linus=adog&harvey=aparrot';
  //     });

  //     var paramValue = Calendar.Utils.URI.getParameterValue('returnTop');
  //     assert.deepEqual(null, paramValue);
  //   });

  //   test('param found', function() {
  //     var returnTop = '/month/';
  //     stub = sinon.stub(window.location, 'search', function() {
  //       return '?alison=ahuman&returnTop=' + returnTop;
  //     });

  //     var paramValue = Calendar.Utils.URI.getParameterValue('returnTop');
  //     assert.deepEqual(returnTop, paramValue);
  //   });

  //   test('param found and urlencoded', function() {
  //     var returnTop = 'trollol lolol lol / o_O';
  //     stub = sinon.stub(window.location, 'search', function() {
  //       return '?returnTop=' + returnTop;
  //     });

  //     var paramValue = Calendar.Utils.URI.getParameterValue('returnTop');
  //     assert.deepEqual(returnTop, paramValue);
  //   });
  // });
});
