Calendar.ns('Utils').OrderedMap = (function() {
  function OrderedMap(list, compare) {
    if (typeof(compare) === 'undefined') {
      compare = Calendar.compare;
    }

    this.compare = function(a, b) {
      return compare(a[0], b[0]);
    };

    if (list) {
      this.items = list.sort(this.compare);
    } else {
      this.items = [];
    }
  };

  OrderedMap.prototype = {

    has: function(value) {
      var idx = this.indexOf(value);
      return this.indexOf(value) !== null;
    },

    insertIndexOf: function(value) {
      return Calendar.binsearch.insert(
        this.items,
        [value],
        this.compare
      );
    },

    /**
     * Finds adjacent value to a given key.
     *
     *
     *    map.adjacent(key, 1); // next
     *    map.adjacent(key, -1); // previous
     *
     *
     * @param {Numeric|String} key of value.
     * @param {Numeric} offset position before or after value to find.
     * @return {Object|Null} found value or null.
     */
    adjacent: function(key, offset) {
      var idx = this.indexOf(key);
      var value = this.items[idx + offset];

      if (idx !== null && value) {
        return value[1];
      }

      return null;
    },

    indexOf: function(value) {
      return Calendar.binsearch.find(
        this.items,
        [value],
        this.compare
      );
    },

    set: function(key, value) {
      var arr = [key, value];

      var idx = Calendar.binsearch.insert(
        this.items,
        arr,
        this.compare
      );

      var prev = this.items[idx];
      var remove = 0;

      if (prev && prev[0] === key) {
        remove = 1;
      }

      this.items.splice(idx, remove, arr);

      return value;
    },

    get: function(item) {
      if (typeof(item) === 'undefined') {
        throw new Error('cannot search "undefined" values');
      }

      var idx = this.indexOf(item);
      if (idx !== null) {
        return this.items[idx][1];
      }
      return null;
    },

    remove: function(key) {
      var idx = this.indexOf(key);

      if (idx !== null) {
        this.items.splice(idx, 1);
      }
    },

    get length() {
      return this.items.length;
    }
  };

  return OrderedMap;
}());
