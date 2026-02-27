/**
 * Polyfills para compatibilidade com IE11
 * Carregue este script antes de qualquer outro JS.
 */
(function() {
    if (!Array.prototype.find) {
        Array.prototype.find = function(predicate) {
            if (this == null) throw new TypeError('Array.prototype.find called on null or undefined');
            if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
            var list = Object(this);
            var len = list.length >>> 0;
            var thisArg = arguments[1];
            for (var i = 0; i < len; i++) {
                if (predicate.call(thisArg, list[i], i, list)) return list[i];
            }
            return undefined;
        };
    }
    if (!Array.prototype.findIndex) {
        Array.prototype.findIndex = function(predicate) {
            if (this == null) throw new TypeError('Array.prototype.findIndex called on null or undefined');
            if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
            var list = Object(this);
            var len = list.length >>> 0;
            var thisArg = arguments[1];
            for (var i = 0; i < len; i++) {
                if (predicate.call(thisArg, list[i], i, list)) return i;
            }
            return -1;
        };
    }
    if (!Array.prototype.includes) {
        Array.prototype.includes = function(searchElement, fromIndex) {
            var o = Object(this);
            var len = o.length >>> 0;
            if (len === 0) return false;
            var n = fromIndex | 0;
            var k = n >= 0 ? n : Math.max(0, len + n);
            while (k < len) {
                if (o[k] === searchElement || (searchElement !== searchElement && o[k] !== o[k])) return true;
                k++;
            }
            return false;
        };
    }
    if (!String.prototype.includes) {
        String.prototype.includes = function(search, start) {
            if (typeof start !== 'number') start = 0;
            if (start + search.length > this.length) return false;
            return this.indexOf(search, start) !== -1;
        };
    }
})();
