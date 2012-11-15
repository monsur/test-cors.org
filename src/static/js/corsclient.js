var SERVER_URL = '$SERVER/server';

var Query = {};

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

Query.serialize = function(queryObj) {
  var queryArray = [];
  for (var key in queryObj) {
    if (!queryObj.hasOwnProperty(key)) {
      continue;
    }
    var val = queryObj[key];
    if (!val) {
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


var Url = function() {
  this.query_ = {};
};

Url.PREFIX_ = '#?';

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

Url.prototype.write = function() {
  var hash = Query.serialize(this.query_);
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
    func.call(null, key, val);
  }
};

var Field = function(id, url) {
  this.id_ = id;
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


var TextField = function() {
  this.base_ = Field;
  this.base_.apply(this, arguments);
};
TextField.prototype = new Field;

TextField.prototype.fromUi = function() {
  this.val_ = $('#' + this.id_).val();
};

TextField.prototype.toUi = function() {
  if (this.val_) {
    $('#' + this.id_).val(this.val_);
  }
};


var CheckboxField = function() {
  this.base_ = Field;
  this.base_.apply(this, arguments);
};
CheckboxField.prototype = new Field;

CheckboxField.prototype.fromUi = function() {
  this.val_ = $('#' + this.id_).is(':checked');
};

CheckboxField.prototype.toUi = function() {
  $('#' + this.id_).prop('checked', this.val_);
};


var TabField = function() {
  this.base_ = Field;
  this.base_.apply(this, arguments);
};
TabField.prototype = new Field;

TabField.prototype.fromUi = function() {
  this.val_ = $('#' + this.id_).children().filter('.active').children().attr('id');
};

TabField.prototype.toUi = function() {
  this.val_ = this.val_ || 'remote';
  $('#' + this.val_).tab('show');
};


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


var setFormFromUrl = function(controller) {
  controller.each(function(index, value) {
    value.fromUrl();
  });
  controller.each(function(index, value) {
    value.toUi();
  });
};

var getId = function(controller) {
  // If maxAge has a value, it means we want the preflight response to be
  // cached. However, preflights are cached by request url. In order for
  // request url to be an exact match, we set it to a fixed id.
  if (controller.getValue('server_max_age')) {
    return 'preflightcache';
  }
  return Math.floor(Math.random()*10000000);
};

var SERVER_PREFIX_ = 'server_';
var getServerUrl = function(controller) {
  if (controller.getValue('server_tabs') == 'remote') {
    return controller.getValue('server_url');
  }

  var queryObj = {};

  queryObj['id'] = getId(controller);

  controller.each(function(index, value) {
    var id = value.getId();
    if (id.indexOf(SERVER_PREFIX_) === 0) {
      if (id === 'server_tabs' || id === 'server_url') {
        return;
      }
      queryObj[value.getId().substring(SERVER_PREFIX_.length)] = value.get();
    }
  });
  var query = Query.serialize(queryObj);
  return SERVER_URL + '?' + query;
};

var supportsCORS = function() {
  return !!((window.XMLHttpRequest && 'withCredentials' in new XMLHttpRequest()) ||
    (window.XDomainRequest));
};

var createCORSRequest = function(method, url) {
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
};

var parseHeaders = function(headerStr) {
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

var sendRequest = function(controller, url) {
  controller.each(function(index, value) {
    value.fromUi();
  });
  controller.each(function(index, value) {
    value.toUrl();
  });
  url.write();

  var httpMethod = controller.getValue('client_method');
  var serverUrl = getServerUrl(controller);
  var xhr = createCORSRequest(httpMethod, serverUrl);

  if (controller.getValue('client_credentials')) {
    xhr.withCredentials = true;
  }

  var requestHeaders = parseHeaders(controller.getValue('client_headers'));
  $.each(requestHeaders, function(key, val) {
    xhr.setRequestHeader(key, val);
  });

  xhr.send();
};


$(function() {
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

  var url = new Url();
  url.read();

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

  $('#btnSendRequest').click(function() {
    sendRequest(controller, url);
  });

  setFormFromUrl(controller);
});


