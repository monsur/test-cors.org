# test-cors.org

The code behind http://test-cors.org

## Directory Structure

The code is divided into two parts:

1. The *client* code in `src/client` that makes the CORS request.
2. The *server* code in `src/server` that receives the CORS request.

The client and server code need to live on different origins (in order to be a
true cross-origin request). The code here is deployed to Google's App Engine.


## Development Workflow for contributing

### Fork and Pull-Request

- Fork this repository,
- create a branch linking to the issue you want to fix,
- commit tested changes
- push to your fork
- once everything is done and the issue is solved, create a Pull-Request

### Local Server

#### Changing the code

The Server is written in Python.

Check your syntax by compiling it:
```
python -m py_compile server/corsserver.py
```

#### Running a local Server

https://cloud.google.com/appengine/docs/standard/python/tools/using-local-server
Install Google Cloud App Engine

Run the local server, for example like this:
```
sudo dev_appserver.py server/app.yaml --port=80
```

You can test the server with cURL.
```
curl -v http://localhost:80/server 
```
it should reply with an HTTP 200 Response.

Then you can create your own requests, for example to try setting an allowed origin: *
```
curl 'http://localhost:80/server?id=3871331&enable=true&status=200&credentials=false&origin=*' -H 'origin: https://www.test-cors.org' -H 'accept: */*' -H 'referer: https://www.test-cors.org/' -v
```
It should reply HTTP 200, with response header `Access-Control-Allow-Origin: *`

### Local Client

Run the local client, for example like this:
```
sudo dev_appserver.py client/app.yaml --port=8080
```

Open `http://localhost:8080`, you will see the *test-cors.org* website.
Select *Server*: Remote, and change the URL to `http://localhost`




