import logging
import random
import json
import string
import webapp2

from google.appengine.api import memcache


class JsonSerializer:

  def getDict(self, d):
    returnd = {}
    for key in d.keys():
      val = d.get(key)
      if val: # This is to guard against a KeyError
        returnd[key] = val
    return returnd

  def getRequestJson(self, request, config):
    reqJson = {}
    reqJson['url'] = request.url
    reqJson['httpMethod'] = config['httpMethod']
    reqJson['headers'] = self.getDict(request.headers)
    reqJson['cookies'] = self.getDict(request.cookies)
    return reqJson

  def getResponseJson(self, response):
    resJson = {}
    resJson['headers'] = self.getDict(response.headers)
    return resJson

  def getBody(self, requestType, request, response, config):
    body = {}
    body['requestType'] = requestType
    body['request'] = self.getRequestJson(request, config)
    body['response'] = self.getResponseJson(response)
    return body


class TextSerializer:

  separator = '========================================'

  def getBodyWithPreflight(self, preflight, cors):
    separator = '========================================'
    return separator + '\r\nPREFLIGHT REQUEST\r\n\r\n' + preflight + '\r\n' + separator + '\r\nCORS REQUEST\r\n\r\n' + cors

  def __init__(self, request, response):
    self.request = request
    self.response = response

  def getItem(self, title, key, val):
    return title + ' = ' + key + ': ' + val + '\r\n'

  def serializeDict(self, title, d):
    buff = ''
    for key in d.keys():
      val = d.get(key)
      if val:  # This is to guard against a KeyError
        buff += self.getItem(title, key, val)
    return buff

  def serializeRequest(self):
    reqstr = 'REQUEST\r\n======\r\n\r\n'
    reqstr += 'url = ' + self.request.url + '\r\n'
    reqstr += self.serializeDict('header', self.request.headers)
    reqstr += self.serializeDict('cookie', self.request.cookies)
    return reqstr

  def serializeResponse(self):
    resstr = 'RESPONSE\r\n========\r\n\r\n'
    resstr = self.serializeDict('header', self.response.headers)
    return resstr

  def getBody(self):
    body = 'The following requests/responses were logged by the server:\r\n\r\n'
    body += self.serializeRequest()
    body += '\r\n\r\n'
    body += self.serializeResponse() + '\r\n'
    return body  


class CorsServer(webapp2.RequestHandler):

  def __isCors(self):
    return 'origin' in self.request.headers

  def __addCorsHeaders(self, config):
    self.response.headers['Access-Control-Allow-Origin'] = self.request.headers['origin']
    self.response.headers['Set-Cookie'] = 'cookie-from-server=noop';
    if 'credentials' in config and config['credentials'] == True:
      self.response.headers['Access-Control-Allow-Credentials'] = 'true'

  def __addResponseHeaders(self, headers, response):
    for key, val in headers.items():
      response.headers[str(key)] = str(val)

  def __handleCors(self, config):
    self.__addCorsHeaders(config)

    exposeHeaders = None
    if 'exposeHeaders' in config:
      exposeHeaders = config['exposeHeaders']
    if exposeHeaders:
      self.response.headers['Access-Control-Expose-Headers'] = str(exposeHeaders)

    if config['responseHeaders']:
      self.__addResponseHeaders(config['responseHeaders'], self.response)

    config['body'] = self.__retrieveBody(config, 'cors')

  def __isPreflight(self, httpMethod):
    return self.__isCors() and httpMethod == 'OPTIONS' and 'Access-Control-Request-Method' in self.request.headers

  def __handlePreflight(self, config):
    self.__addCorsHeaders(config)
    if config['methods'] != '':
      self.response.headers['Access-Control-Allow-Methods'] = str(config['methods'])
    if config['headers'] != '':
      self.response.headers['Access-Control-Allow-Headers'] = str(config['headers'])
    if config['maxAge'] > 0:
      self.response.headers['Access-Control-Max-Age'] = str(config['maxAge'])
    self.__storeBody(config, 'preflight')

  def __storeBody(self, config, reqType):
    serializer = JsonSerializer()
    body = serializer.getBody(reqType, self.request, self.response, config)
    id = config['id']
    if id is not None:
      memcache.set(id, body)

  def __retrieveBody(self, config, reqType):
    body = []
    serializer = JsonSerializer()
    body.append(serializer.getBody(reqType, self.request, self.response, config))
    id = config['id']
    if id is not None:
      prevbody = memcache.get(id)
      if prevbody:
        body.append(prevbody)
        memcache.delete(id)
    return body

  def __parseHeaders(self, headers_str):
    headers = {}
    if headers_str:
      for line in headers_str.splitlines():
        header = line.split(':', 2)
        if len(header) == 2:
          key = header[0]
          val = header[1]
          headers[key] = val
    return headers

  def __getConfig(self, httpMethod):
    config = {}
    enable = False
    if self.request.get('enable') == 'true':
      enable = True
    config['enable'] = enable
    if self.request.get('credentials') == 'true':
      config['credentials'] = True
    config['httpMethod'] = httpMethod
    config['methods'] = self.request.get('methods')
    config['headers'] = self.request.get('headers')
    config['exposeHeaders'] = self.request.get('expose_headers')
    config['id'] = self.request.get('id')
    config['responseHeaders'] = self.__parseHeaders(self.request.get('response_headers'))

    maxAge = -1
    try:
      maxAge = int(self.request.get('max_age'))
    except:
      maxAge = -1
    config['maxAge'] = maxAge

    httpstatus = self.request.get('status')
    if httpstatus:
      config['httpstatus'] = int(httpstatus)

    return config


  def __handleRequest(self, httpMethod):
    config = self.__getConfig(httpMethod)

    self.response.headers['Content-Type'] = 'application/json'
    if 'httpstatus' in config:
      self.response.set_status(config['httpstatus'])

    if self.__isCors() and config['enable'] == True:
      if self.__isPreflight(httpMethod):
        self.__handlePreflight(config)
      else:
        self.__handleCors(config)

    body = ''
    if 'body' in config:
      body = json.dumps(config['body'])
    self.response.headers['Content-Length'] = len(body)
    self.response.out.write(body)

  def delete(self):
    self.__handleRequest('DELETE')

  def get(self):
    self.__handleRequest('GET')

  def head(self):
    self.__handleRequest('HEAD')

  def options(self):
    self.__handleRequest('OPTIONS')

  def post(self):
    self.__handleRequest('POST')

  def put(self):
    self.__handleRequest('PUT')


app = webapp2.WSGIApplication([('/server', CorsServer)])
