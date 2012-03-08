
// TODO: Help descriptions for each item
// TODO: Detect if there is a mismatch and we expect an error.
// TODO: Closure compiler
// TODO: JQuery details

// Browser bugs:
// Setting custom headers on GET requests in WebKit
// Setting cookies in Safari?
// Reading response headers from Chrome?

var serverUrl = '$SERVER/server';


/**
 * @constructor
 */
var Logger = function(opt_destinationId) {
  this.destinationId = '#' + (opt_destinationId || 'outputLog');
};

Logger.prototype.log = function(msg) {
  msg = msg + '<br>';
  if (this.inCode) {
    this.buffer.push(msg);
  } else {
    $(this.destinationId).append(msg);
  }
};

Logger.prototype.startCode = function() {
  this.buffer = [];
  this.inCode = true;
};

Logger.prototype.endCode = function() {
  var msg = this.buffer.join('\r\n');
  msg = '<code>' + msg + '</code>';
  this.buffer = null;
  this.inCode = false;
  this.log(msg);
};

Logger.prototype.clear = function() {
  $(this.destinationId).empty();
};


var logger = new Logger();

function loadQueryString(str) {
  if (typeof(str) != 'string' || str.length == 0) {
    return {};
  }
  if (str.indexOf('?') == 0) {
    str = str.substring(1);
  }
  if (str.length == 0) {
    return {};
  }

  var qs = {};
  var pairs = str.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var parts = pairs[i].split('=');
    if (parts.length < 1 || parts.length > 3) {
      continue;
    }
    var key = parts[0].split('.');
    var value = parts.length == 2 ? decodeURIComponent(parts[1]) : null;
    var location = qs;
    for (var j = 0; j < key.length; j++) {
      var subkey = decodeURIComponent(key[j]);
      if (!location.hasOwnProperty(subkey)) {
        location[subkey] = {};
      }
      if (j == key.length - 1) {
        location[subkey] = value;
      } else {
        location = location[subkey];
      }
    }
  }

  return qs;
}

function getServerSettings() {
  var settings = {};
  settings.enable = !!$('#server_enable').attr('checked');
  settings.credentials = !!$('#server_credentials').attr('checked');
  settings.httpstatus = $('#server_httpstatus').val();
  settings.methods = $('#server_methods').val();
  settings.headers = $('#server_headers').val();
  settings.exposeHeaders = $('#server_expose_headers').val();
  return settings;
}

function getClientSettings() {
  var settings = {};
  settings.method = $('#client_method').val();
  settings.credentials = !!$('#client_credentials').attr('checked');
  settings.headers = parseHeaders($('#client_headers').val());
  return settings;
}

function getSettings() {
  var settings = {};
  settings.server = getServerSettings();
  settings.client = getClientSettings();
  return settings;
}

function getOrigin() {
  if (window.location.origin) {
    return window.location.origin;
  }
  // Firefox 3.6 doesn't have window.location.origin, construct the origin
  // header manually.
  return window.location.protocol + '//' + window.location.host;
}

function getServerRequestUrl(settings) {
  var url = serverUrl + '?';
  url += 'id=' + Math.floor(Math.random()*10000000);
  if (!settings.enable) {
    url += '&enable=false';
  }
  if (settings.credentials) {
    url += '&credentials=true';
  }
  if (settings.httpstatus) {
    url += '&httpstatus=' + encodeURIComponent(settings.httpstatus);
  }
  if (settings.methods) {
    url += '&methods=' + encodeURIComponent(settings.methods);
  }
  if (settings.headers) {
    url += '&headers=' + encodeURIComponent(settings.headers);
  }
  if (settings.exposeHeaders) {
    url += '&exposeHeaders=' + encodeURIComponent(settings.exposeHeaders);
  }
  return url;
}

function parseHeaders(headerStr) {
  var headers = {};
  if (!headerStr) {
    return headers;
  }
  var headerPairs = headerStr.split('\n');
  for (var i = 0; i < headerPairs.length; i++) {
    var headerPair = headerPairs[i];
    var index = headerPair.indexOf(': ');
    if (index > 0) {
      var key = $.trim(headerPair.substring(0, index));
      var val = $.trim(headerPair.substring(index + 2));
      headers[key] = val;
    }
  }
  return headers;
}

function createCORSRequest(method, url){
  var xhr = new XMLHttpRequest();
  if ("withCredentials" in xhr) {
    xhr.open(method, url, true);
  } else if (typeof XDomainRequest != "undefined"){
    xhr = new XDomainRequest();
    xhr.open(method, url);
  } else {
    xhr = null;
  }
  return xhr;
}

function logEvent(msg, opt_color) {
  color = opt_color || 'yellow';
  logger.log('Fired XHR event: <span class="log-' + color + '">' + msg + '</span>');
}

function logXhr(xhr) {
  logger.log('<br>XHR status: ' + xhr.status);
  if ('statusText' in xhr) {
    // Firefox doesn't allow access to statusText when there's an error.
    logger.log('XHR status text: ' + xhr.statusText);
  }

  var msg = '';
  var headers = parseHeaders(xhr.getAllResponseHeaders());
  for (var name in headers) {
    if (!headers.hasOwnProperty(name)) {
      continue;
    }
    if (msg.length > 0) {
      msg += ', ';
    }
    msg += name;
  }
  if (msg.length > 0) {
    logger.log('XHR exposed response headers: ' + msg);
  }

  var text = xhr.responseText;
  if (text) {
    logResponseDetails(JSON.parse(text))
  }
}

function logResponseDetails(response) {
  logger.log('');
  for (var i = 0; i < response.length; i++) {
    var r = response[i];
    if (r['requestType'] == 'preflight') {
      logPreflight(r);
    } else {
      logCors(r);
    }
  }
}

function logHttp(label, r) {
  logger.log(label);
  logger.startCode();
 
  var msg = '';
  if (r['httpMethod']) {
    msg += r['httpMethod'] + ' ';
  }
  if (r['url']) {
    msg += r['url'];
  }
  if (msg.length > 0) {
    logger.log(msg);
  }

  var headers = r['headers'];
  if (headers) {
    for (var name in headers) {
      if (!headers.hasOwnProperty(name)) {
        continue;
      }
      logger.log(name + ': ' + headers[name]);
    }
  }

  logger.endCode();
  logger.log('');
}

function logPreflight(r) {
  logHttp('Preflight Request', r['request']);
  logHttp('Preflight Response', r['response']);
}

function logCors(r) {
  logHttp('CORS Request', r['request']);
  logHttp('CORS Response', r['response']);
}

function handleReadyStateChange(event) {
  logEvent('readystatechange');
}

function handleLoadStart(event) {
  logEvent('loadstart');
}

function handleProgress(event) {
  logEvent('progress');
}

function handleAbort(event) {
  logEvent('abort', 'red');
}

function handleError(event) {
  logEvent('error', 'red');
  logXhr(event.currentTarget);
}

function handleLoad(event) {
  logEvent('load', 'green');
  logXhr(event.currentTarget);
}

function handleTimeout(event) {
  logEvent('timeout', 'red');
}

function handleLoadEnd(event) {
  logEvent('loadend');
}

function sendRequest() {
  logger.clear();

  var settings = getSettings();
  logger.log('<a href="#" onclick="javascript:prompt(\'Here\\\'s a link to this test\', \'' + createLink(settings) + '\');return false;">Link to this test</a>');
  var requestUrl = getServerRequestUrl(settings['server']);

  var msg = 'Sending ' + settings['client']['method'] + ' request to ' +
      requestUrl + '<br>';

  var xhr = createCORSRequest(settings['client']['method'], requestUrl);

  if (settings['client']['credentials']) {
    xhr.withCredentials = true;
    msg += ', with credentials';
  }

  var headersMsg = '';
  var headers = settings['client']['headers'];
  for (var name in headers) {
    if (!headers.hasOwnProperty(name)) {
      continue;
    }
    xhr.setRequestHeader(name, headers[name]);
    if (headersMsg.length == 0) {
      headersMsg = ', with custom headers';
    }
  }
  msg += headersMsg;

  // TODO: functions should be inline in order to work in IE.
  xhr.onreadystatechange = handleReadyStateChange;
  xhr.onloadstart = handleLoadStart;
  xhr.onprogress = handleProgress;
  xhr.onabort = handleAbort;
  xhr.onerror = handleError;
  xhr.onload = handleLoad;
  xhr.ontimeout = handleTimeout;
  xhr.onloadend = handleLoadEnd;

  logger.log(msg);
  xhr.send();
}

function getClientHeaders(headers) {
  var retstr = '';
  for (var name in headers) {
    if (!headers.hasOwnProperty(name)) {
      continue;
    }
    var value = headers[name];
    retstr += name + ': ' + value + '\r\n';
  }
  return retstr;
}

function initializeDefaults(qs) {
  if ('server' in qs) {
    var server = qs['server'];
    serverUrl = server['url'] || serverUrl;
    if (server['enable'] == 'false') {
      $('#server_enable').attr('checked', false);
    }
    if (server['credentials'] == 'true') {
      $('#server_credentials').attr('checked', true);
    }
    if (server['httpstatus']) {
      $('#server_httpstatus').val(server['httpstatus']);
    }
    if (server['methods']) {
      $('#server_methods').val(server['methods']);
    }
    if (server['headers']) {
      $('#server_headers').val(server['headers']);
    }
    if (server['exposeHeaders']) {
      $('#server_expose_headers').val(server['exposeHeaders']);
    }
  }
  if ('client' in qs) {
    var client = qs['client'];
    if (client['method']) {
      $('#client_method').val(client['method']);
    }
    if (client['credentials'] == 'true') {
      $('#client_credentials').attr('checked', true);
    }
    if ('headers' in client) {
      $('#client_headers').val(getClientHeaders(client['headers']));
    }
  }
}

function addQueryString(key, val, buffer, opt_allowEmpty) {
  allowEmpty = opt_allowEmpty || false;
  if (val || allowEmpty) {
    buffer.push(encodeURIComponent(key) + '=' + encodeURIComponent(val));
  }
}

function createQueryString(settings) {
  var buffer = [];
  addQueryString('server.enable', settings['server']['enable'], buffer, true);
  addQueryString('server.credentials', settings['server']['credentials'], buffer);
  addQueryString('server.httpstatus', settings['server']['httpstatus'], buffer);
  addQueryString('server.methods', settings['server']['methods'], buffer);
  addQueryString('server.headers', settings['server']['headers'], buffer);
  addQueryString('server.exposeHeaders', settings['server']['exposeHeaders'], buffer);
  addQueryString('client.method', settings['client']['method'], buffer);
  addQueryString('client.credentials', settings['client']['credentials'], buffer);
  for (var name in settings['client']['headers']) {
    if (!settings['client']['headers'].hasOwnProperty(name)) {
      continue;
    }
    addQueryString('client.headers.' + name, settings['client']['headers'][name], buffer);
  }
  return buffer.join('&');
}

function getDomain() {
  return getOrigin() + window.location.pathname;
}

function createLink(settings) {
  return getDomain() + '?' + createQueryString(settings);
}

function isCorsSupported() {
  return createCORSRequest('GET', '/') != null;
}

$(document).ready(function(){
  if (isCorsSupported()) {
    var qs = loadQueryString(window.location.search || null);
    initializeDefaults(qs);
  } else {
    $('#content').hide();
    $('#corsnotsupported').show();
  }
});
