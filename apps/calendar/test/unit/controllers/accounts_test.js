requireApp('calendar/test/unit/helper.js', function() {
  requireLib('models/calendar.js');
  requireLib('models/account.js');
  requireLib('controllers/accounts.js');
});

suite('controllers/accounts', function() {
  var subject;
  var app;
  var db;

  function stageFunction(store, factory) {
    return function() {
      var added = {};
      var calendars = Array.slice(arguments);

      setup(function(done) {
        var storeObj = app.store(store);
        var storeName = storeObj._store;
        var trans = db.transaction(storeName, 'readwrite');

        trans.addEventListener('complete', function() {
          done();
        });

        trans.addEventListener('error', function(event) {
          done(event.target.error.name);
        });

        calendars.forEach(function(object) {
          var item = Factory(factory, object);
          added[item._id] = item;

          storeObj.persist(
            item,
            trans
          );
        });
      });

      return added;
    }
  }

  setup(function(done) {
    app = testSupport.calendar.app();
    db = app.db;
    subject = app.accountsController;

    db.open(function(err) {
      assert.ok(!err);
      done();
    });
  });

  teardown(function(done) {
    testSupport.calendar.clearStore(
      db,
      ['accounts', 'calendars'],
      done
    );
  });

  test('is on app', function() {
    assert.ok(subject, 'exists on app.accountsController');
  });

  function implementsStoreCaching(api, storeName, factory) {
    var stage = stageFunction(storeName, factory);

    suite('#' + api, function() {
      test('without records', function(done) {
        subject[api](function(err, list) {
          done(function() {
            assert.ok(!err, 'does not include an erorr');
            assert.deepEqual(list, {});
          });
        });
      });

      suite('with records', function() {
        var records = stage(
          { _id: 'one', var1: 1 },
          { _id: 'two', var1: 1 }
        );

        var initialList;

        setup(function(done) {
          subject[api](function(err, list) {
            initialList = list;
            done(err);
          });
        });

        test('initial call', function() {
          var ids = Object.keys(initialList);
          assert.length(ids, 2, 'has ids');

          assert.deepEqual(
            Object.keys(initialList),
            Object.keys(records),
            'ids match database'
          );
        });

        test('subsequent call', function(done) {
          subject[api](function(err, list) {
            done(function() {
              assert.ok(!err, 'should be successful');

              for (var key in list) {
                assert.equal(
                  initialList[key],
                  list[key],
                  'returns same objects "' + key + '"'
                );
              }
            });
          });
        });

        test('deleting a record', function(done) {
          var one = records['one'];
        });
      });

    });
  }

  suite('calendars', function() {
    implementsStoreCaching('calendars', 'Calendar', 'calendar');
  });

  suite('accounts', function() {
    implementsStoreCaching('accounts', 'Account', 'account');
  });
});
