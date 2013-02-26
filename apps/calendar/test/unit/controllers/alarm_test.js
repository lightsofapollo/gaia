requireApp('calendar/shared/js/notification_helper.js');

suiteGroup('Controllers.Alarm', function() {

  var subject;
  var app;
  var db;

  var alarmStore;
  var busytimeStore;
  var eventStore;
  var settingStore;

  setup(function(done) {
    this.timeout(10000);
    app = testSupport.calendar.app();
    db = app.db;
    subject = new Calendar.Controllers.Alarm(app);

    alarmStore = app.store('Alarm');
    busytimeStore = app.store('Busytime');
    eventStore = app.store('Event');
    settingStore = app.store('Setting');

    db.open(function() {
      done();
    });
  });

  teardown(function(done) {
    testSupport.calendar.clearStore(
      db,
      ['accounts', 'calendars', 'events', 'busytimes'],
      done
    );
  });

  teardown(function(done) {
    subject.unobserve();

    var defaults = settingStore.defaults;
    var trans = db.transaction('settings', 'readwrite');

    settingStore.remove('syncFrequency', trans);
    settingStore.remove('syncAlarm', trans);

    trans.oncomplete = function() {
      db.close();
      done();
    };

  });

  suite('#observe', function() {
    var worksQueue;

    var realApi;
    var calledWith;
    var realAlarmApi;
    var currentAlarmTime = null;
    var removed = null;
    var mockRequest = {};
    var realLockApi;
    var wakeLock;

    suiteSetup(function() {
      realApi = navigator.mozSetMessageHandler;
      navigator.mozSetMessageHandler = function() {
        calledWith = arguments;
      };

      realAlarmApi = navigator.mozAlarms;

      var mockAlarms = navigator.mozAlarms = {
        add: function(endTime, _, data) {
          if (data && data.type === 'sync')
            currentAlarmTime = endTime;

          if (mockAlarms.onadd)
            Calendar.nextTick(function() {
              mockAlarms.onadd();
            });

          return mockRequest;
        },

        remove: function(id) {
          removed = id;
          currentAlarmTime = null;
        }
      };

      wakeLock = {
        done: null,

        unlock: function() {
          wakeLock.done();
        }
      };
      realLockApi = navigator.requestWakeLock;
      navigator.requestWakeLock = function(type) {
        if (type === 'wifi')
          return wakeLock;
        else
          return realLockApi(type);
      };
    });

    suiteTeardown(function() {
      navigator.mozSetMessageHandler = realApi;
      navigator.mozAlarms = realAlarmApi;
      navigator.requestWakeLock = realLockApi;
    });

    setup(function() {
      calledWith = false;
      worksQueue = false;
      alarmStore.workQueue = function() {
        worksQueue = true;
      };

      subject.observe();
    });

    teardown(function() {
      // clear request between runs...
      mockRequest = {};
    });

    test('alarm messages', function(done) {
      assert.ok(calledWith);
      assert.equal(calledWith[0], 'alarm');

      subject.handleAlarmMessage = function(msg) {
        done(function() {
          assert.equal(msg, 'foo');
        });
      };

      calledWith[1]('foo');
    });

    suite('#_sendAlarmNotification', function() {
      var realApi;
      var lastNotification;
      var sent = [];
      var onsend;
      var mockApi = {
        send: function() {
          sent.push(Array.prototype.slice.call(arguments));
          lastNotification = {};
          lastNotification;

          // wait until next tick...
          setTimeout(function() {
            onsend();
          }, 0);
        },

        getIconURI: function() {
          return 'icon';
        }
      };

      suiteSetup(function() {
        realApi = window.NotificationHelper;
        window.NotificationHelper = mockApi;
      });

      suiteTeardown(function() {
        window.NotificationHelper = realApi;
      });
/*
// These tests are currently failing on travis and have been temporarily
// disabled as per Bug 841815. They should be fixed and re-enabled as soon as
// possible as per Bug 840489.
      test('result', function(done) {
        sent.length = 0;
        var sentTo;

        var now = new Date();
        var event = Factory('event');
        var busytime = Factory('busytime');

        app.router.show = function(url) {
          sentTo = url;
        };

        onsend = function() {
          done(function() {
            var note = sent[0];
            assert.equal(note[1], event.remote.description);
            note[3]();
            assert.ok(sentTo);
            assert.include(sentTo, busytime._id);
          });
        };

        subject._sendAlarmNotification({}, event, busytime);
      });
*/
    });

    suite('#handleAlarm', function() {
      var sent = [];
      var busytime;
      var event;
      var alarm;

      var transPending = 0;

      function createTrans(done) {
        var trans = eventStore.db.transaction(
          ['busytimes', 'events', 'alarms'],
          'readwrite'
        );

        if (done) {
          trans.addEventListener('complete', function() {
            // wait until next tick so sync processing
            // of handleAlarm can finish first.
            setTimeout(function() {
              done();
            }, 0);
          });
        }

        return trans;
      }

      setup(function() {
        transPending = 0;
        sent.length = 0;
        event = null;
        busytime = null;

        subject._sendAlarmNotification = function() {
          sent.push(arguments);
        };
      });

      function setupAlarms(cb) {
        setup(function(done) {
          var trans = createTrans(done);
          cb(trans);

          if (alarm) {
            alarmStore.persist(alarm, trans);
          }

          if (event) {
            eventStore.persist(event, trans);
          }

          if (busytime) {
            busytimeStore.persist(busytime, trans);
          }
        });
      }

      suite('busytime in the past', function() {
        setupAlarms(function(trans) {
          var time = new Date();
          time.setMinutes(time.getMinutes() - 3);

          event = Factory('event');

          busytime = Factory('busytime', {
            eventId: event._id,
            startTime: new Date(2012, 0, 1),
            endDate: time
          });

          alarm = Factory('alarm', {
            startDate: new Date(2012, 0, 2),
            eventId: event._id,
            busytimeId: busytime._id
          });
        });

        test('result', function(done) {
          var trans = createTrans(function() {
            done(function() {
              assert.length(sent, 0);
            });
          });
          subject.handleAlarm(alarm, trans);
        });
      });

      test('missing records', function(done) {
        var trans = createTrans(function() {
          done(function() {
            assert.equal(sent.length, 0);
          });
        });

        alarm = {
          eventId: 12,
          busytimeId: 12
        };

        subject.handleAlarm(alarm, trans);
      });

      suite('valid busytime', function() {
        setupAlarms(function(trans) {
          var ends = new Date();
          ends.setMinutes(ends.getMinutes() + 100);

          event = Factory('event');

          busytime = Factory('busytime', {
            eventId: event._id,
            startTime: new Date(2012, 0, 1),
            endDate: ends
          });

          alarm = Factory('alarm', {
            eventId: event._id,
            busytimeId: busytime._id
          });
        });

        test('result', function(done) {
          var trans = createTrans(function() {
            done(function() {
              assert.deepEqual(sent[0][0], alarm);
              assert.length(sent, 1);
            });
          });
          subject.handleAlarm(alarm, trans);
        });
      });
    });

    suite('sync alarms', function() {
      function sendId(id) {
        mockRequest.onsuccess({
          target: {
            result: id
          }
        });
      }

      function willChangeAlarmId(newId, done) {
        navigator.mozAlarms.onadd = function() {
          settingStore.getValue('syncAlarm', function(err, value) {
            done(function() {
              assert.equal(value.alarmId, newId, 'changes alarm id');
            });
          });
        };
      }

      // get initial frequency
      var initialFreq;
      setup(function(done) {
        settingStore.getValue('syncFrequency', function(err, freq) {
          initialFreq = freq;
          done();
        });
      });

      // send initial alarm
      var initialAlarmId = 1;
      setup(function(done) {
        navigator.mozAlarms.onadd = function() {
          sendId(initialAlarmId);
          done();
        };
      });

      test('initial alarms', function(done) {
        settingStore.getValue('syncAlarm', function(err, value) {
          done(function() {
            assert.equal(
              value.alarmId,
              initialAlarmId,
              'saves alarm reference'
            );

            // calculate duration
            var duration = (
              (value.end.valueOf() - value.start.valueOf()) / 1000 / 60
            );

            assert.equal(
              // we don't care about seconds much its likely test drift.
              Math.ceil(duration),
              initialFreq,
              'sets correct duration'
            );
          });
        });
      });

      test('remove alarm by changing syncFrequency', function(done) {
        settingStore.set('syncFrequency', null);
        assert.equal(removed, initialAlarmId, 'removes alarm from mozAlarms');

        settingStore.getValue('syncAlarm', function(err, value) {
          done(function() {
            assert.hasProperties(value, {
              alarmId: null,
              end: null,
              start: null
            });
          });
        });
      });

      test('setting sync to +15 minutes', function(done) {
        var newAlarmId = 2;
        var newFreq = initialFreq + 15;

        // async assertion that alarm id will change
        willChangeAlarmId(2, done);
        settingStore.set('syncFrequency', newFreq);

        // verify new alarm was set with right date
        var difference = Math.round(
          (currentAlarmTime - new Date()) / 1000 / 60
        );

        assert.equal(difference, newFreq);
        sendId(2);

        assert.equal(
          removed, initialAlarmId,
          'removes previous alarm on change'
        );
      });
    });

    return;
    test('sync alarm', function() {
      function sendId(id) {
        mockRequest.onsuccess({
          target: {
            result: id
          }
        });
      }

      currentAlarmTime = null;
      removed = null;

      // Test setting sync to 15 minutes
      settingStore.set('syncFrequency', 15);
      var difference = Math.round((currentAlarmTime - new Date()) / 1000 / 60);
      assert.equal(difference, 15);
      sendId(2);
      assert.equal(removed, 1);
      var previousTime = currentAlarmTime - 15 * 60 * 1000; // Previous start time

      // Test setting sync to 30 minutes and confirm it uses the previous start time
      settingStore.set('syncFrequency', 30);
      var nextTime = previousTime + 30 * 60 * 1000;
      assert.equal(nextTime, currentAlarmTime.getTime());
      sendId(3);
      assert.equal(removed, 2);

      // Test setting sync off
      currentAlarmTime = null;
      settingStore.set('syncFrequency', null);
      assert.equal(currentAlarmTime, null);
      assert.equal(removed, 3);
    });

    test('sync alarm triggering', function(done) {
      wakeLock.done = done;

      subject._handleSyncMessage();
      // This test will succeed when the wifi lock is released
    });
  });



});
