import logging

from google.appengine.api import memcache
from google.appengine.ext import webapp
from google.appengine.ext.webapp.util import run_wsgi_app

# TODO: Head responses shouldn't have a body.


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


class CorsServer(webapp.RequestHandler):

  def __isCors(self):
    return 'origin' in self.request.headers

  def __addCorsHeaders(self, config):
    self.response.headers['Access-Control-Allow-Origin'] = self.request.headers['origin']
    self.response.headers['Set-Cookie'] = 'cookie-from-server=noop';
    if 'credentials' in config and config['credentials'] == True:
      self.response.headers['Access-Control-Allow-Credentials'] = 'true'

  def __exposeResponseHeaders(self, header_list, response):
    for header in header_list:
      response.headers[header] = header + '_value'

  def __handleCors(self, config):
    self.__addCorsHeaders(config)

    exposeHeaders = None
    if 'exposeHeaders' in config:
      exposeHeaders = config['exposeHeaders']
    if exposeHeaders:
      self.response.headers['Access-Control-Expose-Headers'] = exposeHeaders
      self.__exposeResponseHeaders(exposeHeaders.split(','), self.response)

    config['body'] = self.__retrieveBody(config)

  def __isPreflight(self, httpMethod):
    return self.__isCors() and httpMethod == 'OPTIONS' and 'Access-Control-Request-Method' in self.request.headers

  def __handlePreflight(self, config):
    self.__addCorsHeaders(config)
    if config['methods'] != '':
      self.response.headers['Access-Control-Allow-Methods'] = config['methods']
    if config['headers'] != '':
      self.response.headers['Access-Control-Allow-Headers'] = config['headers']
    self.__storeBody(config)

  def __storeBody(self, config):
    serializer = TextSerializer(self.request, self.response)
    body = serializer.getBody()
    id = config['id']
    if id is not None:
      memcache.set(id, body)

  def __retrieveBody(self, config):
    serializer = TextSerializer(self.request, self.response)
    body = serializer.getBody()
    id = config['id']
    if id is not None:
      prevbody = memcache.get(id)
      if prevbody is not None:
        body = serializer.getBodyWithPreflight(prevbody, body)
        memcache.delete(id)
    return body

  def __getConfig(self):
    config = {}
    config['enable'] = self.request.get('enable', True)
    if self.request.get('credentials') == 'true':
      config['credentials'] = True
    config['methods'] = self.request.get('methods')
    config['headers'] = self.request.get('headers')
    config['exposeHeaders'] = self.request.get('exposeHeaders')
    config['id'] = self.request.get('id')

    httpstatus = self.request.get('httpstatus')
    if httpstatus:
      config['httpstatus'] = int(httpstatus)

    return config

  def __sendResponse(self, config):
    self.response.headers['Content-Type'] = 'text/plain'
    if 'httpstatus' in config:
      self.response.set_status(config['httpstatus'])
    body = ''
    if 'body' in config:
      body = config['body']
    self.response.headers['Content-Length'] = len(body)
    self.response.out.write(body)

  def __handleRequest(self, httpMethod):
   config = self.__getConfig()
   if self.__isCors() and config['enable'] == True:
     if self.__isPreflight(httpMethod):
       self.__handlePreflight(config)
     else:
       self.__handleCors(config)
   self.__sendResponse(config)

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


application = webapp.WSGIApplication([('/server', CorsServer)],
                                     debug=True)


def main():
  logging.getLogger().setLevel(logging.DEBUG)
  run_wsgi_app(application)


if __name__ == "__main__":
  main()
