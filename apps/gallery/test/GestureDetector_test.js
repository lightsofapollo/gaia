requireApp('gallery/js/GestureDetector.js');

suite('GestureDetector', function() {

  var subject,
      element;

  setup(function() {
    element = document.createElement('div');
    element.id = 'test';
    document.body.appendChild(element);

    subject = new GestureDetector(element);
  });

  teardown(function() {
    document.body.removeChild(element);
  });

  test('initialization', function() {
    assert.isObject(subject.timers, 'should setup timers');
    assert.equal(subject.element, element, 'should have element');
  });

});
