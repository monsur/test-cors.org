(function(window, undefined) {

/**
 * The url to send the request to
 * (if using "local" mode).
 */
var SERVER_URL = '$SERVER/server';

/**
 * The prefix to identify server fields.
 */
var SERVER_PREFIX_ = 'server_';


/**
 * Helper function to html escape a string.
 */
var htmlEscape = function(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};


/**
 * Logs status messages to the results log section of the page.
 * @constructor
 */
var Logger = function(opt_id) {
  this.elem_ = $('#' + (opt_id || 'tabresultlog'));
};

/**
 * Log a status message to the results log.
 * Does not HTML escape the message.
 */
Logger.prototype.log = function(msg) {
  msg = msg + '<br>';
  if (this.inCode_) {
    this.buffer_.push(msg);
  } else {
    this.elem_.append(msg);
  }
};

Logger.prototype.startCode = function() {
  this.buffer_ = [];
  this.inCode_ = true;
};

Logger.prototype.endCode = function() {
  var msg = this.buffer_.join('');
  msg = '<pre>' + msg + '</pre>';
  this.buffer_ = null;
  this.inCode_ = false;
  this.log(msg);
};

Logger.prototype.reset = function() {
  this.elem_.empty();
};

Logger.prototype.logEvent = function(msg, opt_color) {
  var color = opt_color || 'yellow';
  this.log(
      'Fired XHR event: <span class="log-' + color + '">' + msg + '</span>');
}

Logger.prototype.logXhr = function(xhr) {
  this.log('<br>XHR status: ' + xhr.status);
  if ('statusText' in xhr) {
    // Firefox doesn't allow access to statusText when there's an error.
    this.log('XHR status text: ' + htmlEscape(xhr.statusText));
  }

  if ('getAllResponseHeaders' in  xhr) {
    var headers = xhr.getAllResponseHeaders();
    if (headers) {
      this.log('XHR exposed response headers: ' +
          '<pre class="headers">' + htmlEscape(headers) + '</pre>');
    }
  }

  var text = xhr.responseText;
  if (text) {
    try {
      // Log the details of the body.
      // If this is a request to the local test server, the response body will
      // be a JSON object containing the request and response HTTP details.
      var response = JSON.parse(text);
      this.log('');
      for (var i = 0; i < response.length; i++) {
        var r = response[i];
        if (r['requestType'] == 'preflight') {
          this.logPreflight(r);
        } else {
          this.logCors(r);
        }
      }
    } catch (e) {
      // Response was not JSON
      // Don't log the body.
    }
  }
}

Logger.prototype.logHttp = function(label, r) {
  this.log(htmlEscape(label));
  this.startCode();

  var msg = '';
  if (r['httpMethod']) {
    msg += htmlEscape(r['httpMethod']) + ' ';
  }
  if (r['url']) {
    msg += htmlEscape(r['url']);
  }
  if (msg.length > 0) {
    this.log(msg);
  }

  var headers = r['headers'];
  if (headers) {
    for (var name in headers) {
      if (!headers.hasOwnProperty(name)) {
        continue;
      }
      this.log(htmlEscape(name) + ': ' + htmlEscape(headers[name]));
    }
  }

  this.endCode();
  this.log('');
}

Logger.prototype.logPreflight = function(r) {
  this.logHttp('Preflight Request', r['request']);
  this.logHttp('Preflight Response', r['response']);
}

Logger.prototype.logCors = function(r) {
  this.logHttp('CORS Request', r['request']);
  this.logHttp('CORS Response', r['response']);
}

var logger = new Logger();


/**
 * Like a logger, but for the code section.
 */
var Codder = function() {
};

Codder.prototype.setUrl = function(url) {
  $('#code_url').text(url);
};

Codder.prototype.setMethod = function(method) {
  $('#code_method').text(method);
};

Codder.prototype.addExtra = function(code) {
  if ($('#code_extras').children().length === 0) {
    code = '\r\n' + code;
  }
  $('#code_extras').append(code);
};

Codder.prototype.setCredentials = function() {
  this.addExtra('xhr.withCredentials = true;');
};

Codder.prototype.addHeader = function(key, value) {
  this.addExtra('xhr.setRequestHeader(\'' + htmlEscape(key) + '\', \'' + htmlEscape(value) + '\');');
};

/**
 * Reset the code section by clearing out the variables.
 */
Codder.prototype.reset = function() {
  $('#code_url').empty();
  $('#code_method').empty();
  $('#code_extras').empty();
};

var codder = new Codder();


/**
 * Helper functions to parse key/value pairs in a query string.
 */
var Query = {};

/**
 * Parses the values of the query string into an object.
 * e.g. a=1&b=2 => {a: '1', b: '2'}
 */
Query.parse = function(query) {
  var queryObj = {};

  if (!query) {
    return queryObj;
  }

  pairs = query.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i];
    parts = pair.split('=');
    if (parts.length != 2) {
      continue;
    }
    var key = decodeURIComponent(parts[0]);
    var val = decodeURIComponent(parts[1]) || null;
    queryObj[key] = val;
  }

  return queryObj;
};

/**
 * Serializes an object to a query string.
 * e.g. {a: '1', b: '2'} => a=1&b=2
 */
Query.serialize = function(queryObj) {
  var queryArray = [];
  for (var key in queryObj) {
    if (!queryObj.hasOwnProperty(key)) {
      continue;
    }

    var val = queryObj[key];
    if (val === null || val === undefined || val === '') {
      // Skip the value if it does not exist.
      // Note that boolean 'false' is considered significant and will be
      // preserved.
      continue;
    }

    if (queryArray.length > 0) {
      queryArray.push('&');
    }
    queryArray.push(encodeURIComponent(key));
    queryArray.push('=');
    queryArray.push(encodeURIComponent(val));
  }

  return queryArray.join('');
};


/**
 * Reads/Writes data values from the url.
 */
var Url = function() {
  this.query_ = {};
};

Url.PREFIX_ = '#?';

/**
 * Read the data from the url hash.
 */
Url.prototype.read = function(opt_hash) {
  this.query_ = {};
  var hash = opt_hash || window.location.hash;
  if (!hash) {
    return;
  }

  if (hash.indexOf(Url.PREFIX_) === 0) {
    hash = hash.substring(2);
  }
  if (!hash) {
    return;
  }

  this.query_ = Query.parse(hash);
};

/**
 * Write the data back to the url.
 */
Url.prototype.write = function() {
  var hash = Query.serialize(this.query_);
  // TODO: Use history API here.
  window.location.hash = Url.PREFIX_ + hash;
};

Url.prototype.get = function(key) {
  return this.query_[key];
};

Url.prototype.set = function(key, val) {
  this.query_[key] = val;
};

Url.prototype.each = function(func) {
  for (var key in this.query_) {
    if (!this.query_.hasOwnProperty(key)) {
      continue;
    }
    var val = this.query_[key];
    func.call(window, key, val);
  }
};


/**
 * Represents a single field on the page.
 * A field contains data from the UI (like a text field or a checkbox) that is
 * used by the app and is preserved in the url.
 */
var Field = function(id, url) {
  this.id_ = id;
  this.elem_ = $('#' + id);
  this.url_ = url;
  this.val_ = null;
};

Field.prototype.getId = function() {
  return this.id_;
}

Field.prototype.get = function() {
  return this.val_;
}

Field.prototype.set = function(val) {
  this.val_ = val;
};

Field.prototype.fromUrl = function() {
  this.val_ = this.url_.get(this.id_);
};

Field.prototype.toUrl = function() {
  this.url_.set(this.id_, this.val_);
};


/**
 * A form text box.
 */
var TextField = function() {
  this.base_ = Field;
  this.base_.apply(this, arguments);
};
TextField.prototype = new Field;

TextField.prototype.fromUi = function() {
  this.val_ = this.elem_.val();
};

TextField.prototype.toUi = function() {
  if (this.val_) {
    // Only set the value if it exists.
    // This preserves any default value in the field.
    this.elem_.val(this.val_);
  }
};


/**
 * A form checkbox field.
 */
var CheckboxField = function() {
  this.base_ = Field;
  this.base_.apply(this, arguments);
};
CheckboxField.prototype = new Field;

CheckboxField.prototype.fromUrl = function() {
  var val = this.url_.get(this.id_);
  if (val !== null && typeof val !== 'undefined') {
    // Only set the value if it exists in the query string
    // Otherwise the default value from the HTML is used.
    val = (val === 'true');
  }
  this.val_ = val;
};

CheckboxField.prototype.fromUi = function() {
  this.val_ = this.elem_.is(':checked');
};

CheckboxField.prototype.toUi = function() {
  if (this.val_ !== null) {
    this.elem_.prop('checked', this.val_);
  }
};


/**
 * A Bootstrap tab bar.
 */
var TabField = function() {
  this.base_ = Field;
  this.base_.apply(this, arguments);
};
TabField.prototype = new Field;

TabField.prototype.fromUi = function() {
  // The value is the id of the alink inside the selected item's li.
  this.val_ = this.elem_.children().filter('.active').children().attr('id');
};

TabField.prototype.toUi = function() {
  // Default value of this field is 'remote'.
  this.val_ = this.val_ || 'remote';
  $('#' + this.val_).tab('show');
};


/**
 * Manages all the fields on this page.
 */
var FieldsController = function() {
  this.items_ = {};
};

FieldsController.prototype.add = function(field) {
  this.items_[field.getId()] = field;
}

FieldsController.prototype.each = function(func) {
  $.each(this.items_, func);
};

FieldsController.prototype.getValue = function(id) {
  return this.items_[id].get();
};


/**
 * Retrieve a unique ID to bust the preflight cache
 * (Or used the fixed 'preflightcache' value if we want to honor the preflight
 * cache).
 */
var getId = function(controller) {
  // If maxAge has a value, it means we want the preflight response to be
  // cached. However, preflights are cached by request url. In order for
  // request url to be an exact match, we set it to a fixed id.
  if (controller.getValue('server_max_age')) {
    return 'preflightcache';
  }
  return Math.floor(Math.random()*10000000);
};


/**
 * Retrieve the url to make the request to.
 */
var getServerUrl = function(controller) {
  if (controller.getValue('server_tabs') == 'remote') {
    // If running in "remote" mode, use the url supplied by the user.
    return controller.getValue('server_url');
  }

  var queryObj = {};

  queryObj['id'] = getId(controller);

  controller.each(function(index, value) {
    var id = value.getId();
    if (id.indexOf(SERVER_PREFIX_) === 0) {
      if (id === 'server_tabs' || id === 'server_url') {
        // Skip any server fields that aren't used by the local server.
        return;
      }
      queryObj[value.getId().substring(SERVER_PREFIX_.length)] = value.get();
    }
  });

  return SERVER_URL + '?' + Query.serialize(queryObj);
};


/**
 * Returns a new XMLHttpRequest object (or null if CORS is not supported).
 */
var createCORSRequest = function(method, url) {
  var xhr = new XMLHttpRequest();
  if ("withCredentials" in xhr) {
    // Most browsers.
    xhr.open(method, url, true);
  } else if (typeof XDomainRequest != "undefined") {
    // IE8 & IE9
    xhr = new XDomainRequest();
    xhr.open(method, url);
  } else {
    // CORS not supported.
    xhr = null;
  }
  return xhr;
};


/**
 * Parses a text blob representing a set of HTTP headers. Expected format:
 * HeaderName1: HeaderValue1\r\n
 * HeaderName2: HeaderValue2\r\n
 */
var parseHeaders = function(headerStr) {
  var headers = {};

  if (!headerStr) {
    return headers;
  }

  var headerPairs = headerStr.split('\n');
  for (var i = 0; i < headerPairs.length; i++) {
    var headerPair = headerPairs[i];
    // Can't use split() here because it does the wrong thing
    // if the header value has the string ": " in it.
    var index = headerPair.indexOf(': ');
    if (index > 0) {
      var key = $.trim(headerPair.substring(0, index));
      var val = $.trim(headerPair.substring(index + 2));
      headers[key] = val;
    }
  }

  return headers;
}


/**
 * Sends the CORS request to the server, and logs key events.
 */
var sendRequest = function(controller, url) {
  // Reset the logs for a new run.
  logger.reset();
  codder.reset();

  // Load the value from the form and write them to the url.
  controller.each(function(index, value) {
    value.fromUi();
    value.toUrl();
  });
  url.write();

  // Link to this test.
  logger.log('<a href="#" onclick="javascript:prompt(\'Here\\\'s a link to this test\', \'' + htmlEscape(window.location.href) + '\');return false;">Link to this test</a><br>');

  // Create the XHR object and make the request.
  var httpMethod = controller.getValue('client_method');
  var serverUrl = getServerUrl(controller);
  var xhr = createCORSRequest(httpMethod, serverUrl);
  var msg = 'Sending ' + htmlEscape(httpMethod) + ' request to ' +
      '<code>' + htmlEscape(serverUrl) + '</code><br>';
  codder.setUrl(serverUrl);
  codder.setMethod(httpMethod);

  if (controller.getValue('client_credentials')) {
    xhr.withCredentials = true;
    msg += ', with credentials';
    codder.setCredentials();
  }

  var headersMsg = '';
  var requestHeaders = parseHeaders(controller.getValue('client_headers'));
  $.each(requestHeaders, function(key, val) {
    xhr.setRequestHeader(key, val);
    codder.addHeader(key, val);
    if (headersMsg.length == 0) {
      headersMsg = ', with custom headers: ';
    } else {
      headersMsg += ', ';
    }
    headersMsg += htmlEscape(key);
  });
  msg += headersMsg;

  xhr.onreadystatechange = function() {
    logger.logEvent('readystatechange');
  };

  xhr.onloadstart = function() {
    logger.logEvent('loadstart');
  };

  xhr.onprogress = function() {
    logger.logEvent('progress');
  };

  xhr.onabort = function() {
    logger.logEvent('abort', 'red');
  };

  xhr.onerror = function() {
    logger.logEvent('error', 'red');
    logger.logXhr(xhr);
  };

  xhr.onload = function() {
    logger.logEvent('load', 'green');
    logger.logXhr(xhr);
  };

  xhr.ontimeout = function() {
    logger.logEvent('timeout', 'red');
  };

  xhr.onloadend = function() {
    logger.logEvent('loadend');
  };

  logger.log(msg);

  var postData = controller.getValue('client_postdata');
  if (postData !== '') {
    xhr.send(postData);
  } else {
    xhr.send();
  }

};


$(function() {

  // Set up the help menus.
  var help_divs = $('.control-group').filter('div[id]').each(function() {
    var id = $(this).attr('id');
    var placement = 'left';
    if (id.indexOf('server_') == 0) {
      placement = 'right';
    }
    $(this).popover({
      placement: placement,
      trigger: 'hover'});
  });

  // Set up the shared url object.
  var url = new Url();
  url.read();

  // Initialize the fields.
  var controller = new FieldsController();
  $('.control-label').each(function() {
    var id = $(this).attr('for');
    var field = null;
    if ($('#' + id).attr('type') === 'checkbox') {
      field = new CheckboxField(id, url);
    } else {
      field = new TextField(id, url);
    }
    controller.add(field);
  });
  controller.add(new TabField('server_tabs', url));

  // Wire up an event handler on the button.
  $('#btnSendRequest').click(function() {
    sendRequest(controller, url);
  });

  $('#result_tabs a:first').tab('show');

  // Read the values from the url and write it to the UI.
  controller.each(function(index, value) {
    value.fromUrl();
    value.toUi();
  });
});

})(window);
