/* global FakeBlob tus */

var isBrowser  = typeof window !== "undefined";
var isNode     = !isBrowser;

describe("tus", function () {
  describe("#Upload", function () {

    beforeEach(function () {
      jasmine.Ajax.install();

      // Clear localStorage before every test to prevent stored URLs to
      // interfere with our setup.
      if (isBrowser) {
        localStorage.clear();
      }
    });

    afterEach(function () {
      jasmine.Ajax.uninstall();
    });

    it("should throw if no error handler is available", function () {
      var upload = new tus.Upload(null);
      expect(upload.start).toThrow();
    });

    it("should upload a file", function (done) {
      var file = new FakeBlob("hello world".split(""));
      var options = {
        endpoint: "/uploads",
        headers: {
          Custom: "blargh"
        },
        metadata: {
          foo: "hello",
          bar: "world",
          nonlatin: "słońce"
        },
        withCredentials: true,
        onProgress: function () {},
        fingerprint: function () {}
      };
      spyOn(options, "fingerprint").and.returnValue("fingerprinted");
      spyOn(options, "onProgress");

      var upload = new tus.Upload(file, options);
      upload.start();

      expect(options.fingerprint).toHaveBeenCalledWith(file);

      var req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("/uploads");
      expect(req.method).toBe("POST");
      expect(req.requestHeaders.Custom).toBe("blargh");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
      expect(req.requestHeaders["Upload-Length"]).toBe(11);
      if (isBrowser) expect(req.withCredentials).toBe(true);
      if (isNode || (isBrowser && "btoa" in window)) {
        expect(req.requestHeaders["Upload-Metadata"]).toBe("foo aGVsbG8=,bar d29ybGQ=,nonlatin c8WCb8WEY2U=");
      }

      req.respondWith({
        status: 201,
        responseHeaders: {
          Location: "/uploads/blargh"
        }
      });

      expect(upload.url).toBe("/uploads/blargh");

      req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("/uploads/blargh");
      expect(req.method).toBe("PATCH");
      expect(req.requestHeaders.Custom).toBe("blargh");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
      expect(req.requestHeaders["Upload-Offset"]).toBe(0);
      expect(req.contentType()).toBe("application/offset+octet-stream");
      expect(req.params.size).toBe(11);
      if (isBrowser) expect(req.withCredentials).toBe(true);

      req.respondWith({
        status: 204,
        responseHeaders: {
          "Upload-Offset": 11
        }
      });

      expect(options.onProgress).toHaveBeenCalledWith(11, 11);
      done();
    });

    it("should create an upload if resuming fails", function (done) {
      var file = new FakeBlob("hello world".split(""));
      var options = {
        endpoint: "/uploads",
        uploadUrl: "/uploads/resuming"
      };

      var upload = new tus.Upload(file, options);
      upload.start();

      var req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("/uploads/resuming");
      expect(req.method).toBe("HEAD");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");

      req.respondWith({
        status: 404
      });

      expect(upload.url).toBe(null);

      req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("/uploads");
      expect(req.method).toBe("POST");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
      expect(req.requestHeaders["Upload-Length"]).toBe(11);
      done();
    });

    it("should upload a file in chunks", function (done) {
      var file = new FakeBlob("hello world".split(""));
      var options = {
        endpoint: "/uploads",
        chunkSize: 7,
        onProgress: function () {},
        onChunkComplete: function () {},
        fingerprint: function () {}
      };
      spyOn(options, "fingerprint").and.returnValue("fingerprinted");
      spyOn(options, "onProgress");
      spyOn(options, "onChunkComplete");

      var upload = new tus.Upload(file, options);
      upload.start();

      expect(options.fingerprint).toHaveBeenCalledWith(file);

      var req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("/uploads");
      expect(req.method).toBe("POST");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
      expect(req.requestHeaders["Upload-Length"]).toBe(11);

      req.respondWith({
        status: 201,
        responseHeaders: {
          Location: "/uploads/blargh"
        }
      });

      expect(upload.url).toBe("/uploads/blargh");

      req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("/uploads/blargh");
      expect(req.method).toBe("PATCH");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
      expect(req.requestHeaders["Upload-Offset"]).toBe(0);
      expect(req.contentType()).toBe("application/offset+octet-stream");
      expect(req.params.size).toBe(7);

      req.respondWith({
        status: 204,
        responseHeaders: {
          "Upload-Offset": 7
        }
      });

      req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("/uploads/blargh");
      expect(req.method).toBe("PATCH");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
      expect(req.requestHeaders["Upload-Offset"]).toBe(7);
      expect(req.contentType()).toBe("application/offset+octet-stream");
      expect(req.params.size).toBe(4);

      req.respondWith({
        status: 204,
        responseHeaders: {
          "Upload-Offset": 11
        }
      });
      expect(options.onProgress).toHaveBeenCalledWith(11, 11);
      expect(options.onChunkComplete).toHaveBeenCalledWith(7, 7, 11);
      expect(options.onChunkComplete).toHaveBeenCalledWith(4, 11, 11);
      done();
    });

    it("should add the original request to errors", function () {
      var file = new FakeBlob("hello world".split(""));
      var err;
      var options = {
        endpoint: "/uploads",
        onError: function (e) {
          err = e;
        }
      };

      var upload = new tus.Upload(file, options);
      upload.start();

      var req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("/uploads");
      expect(req.method).toBe("POST");

      req.respondWith({
        status: 500,
        responseHeaders: {
          Custom: "blargh"
        }
      });

      expect(upload.url).toBe(null);

      expect(err.message).toBe("tus: unexpected response while creating upload, originated from request (response code: 500, response text: )");
      expect(err.originalRequest).toBeDefined();
      expect(err.originalRequest.getResponseHeader("Custom")).toBe("blargh");
    });

    it("should not resume a finished upload", function (done) {
      var file = new FakeBlob("hello world".split(""));
      var options = {
        endpoint: "/uploads",
        onProgress: function () {},
        onSuccess: function () {},
        uploadUrl: "/uploads/resuming"
      };
      spyOn(options, "onProgress");
      spyOn(options, "onSuccess");

      var upload = new tus.Upload(file, options);
      upload.start();

      var req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("/uploads/resuming");
      expect(req.method).toBe("HEAD");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");

      req.respondWith({
        status: 204,
        responseHeaders: {
          "Upload-Length": "11",
          "Upload-Offset": "11"
        }
      });

      expect(options.onProgress).toHaveBeenCalledWith(11, 11);
      expect(options.onSuccess).toHaveBeenCalled();
      done();
    });

    it("should resume an upload from a specified url", function (done) {
      var file = new FakeBlob("hello world".split(""));
      var options = {
        endpoint: "/uploads",
        uploadUrl: "/files/upload",
        onProgress: function () {},
        fingerprint: function () {}
      };
      spyOn(options, "fingerprint").and.returnValue("fingerprinted");
      spyOn(options, "onProgress");

      var upload = new tus.Upload(file, options);
      upload.start();

      expect(options.fingerprint.calls.count()).toEqual(0);
      expect(upload.url).toBe("/files/upload");

      var req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("/files/upload");
      expect(req.method).toBe("HEAD");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");

      req.respondWith({
        status: 204,
        responseHeaders: {
          "Upload-Length": 11,
          "Upload-Offset": 3
        }
      });

      req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("/files/upload");
      expect(req.method).toBe("PATCH");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
      expect(req.requestHeaders["Upload-Offset"]).toBe(3);
      expect(req.contentType()).toBe("application/offset+octet-stream");
      expect(req.params.size).toBe(11 - 3);

      req.respondWith({
        status: 204,
        responseHeaders: {
          "Upload-Offset": 11
        }
      });

      expect(options.onProgress).toHaveBeenCalledWith(11, 11);
      done();
    });

    it("should override the PATCH method", function (done) {
      var file = new FakeBlob("hello world".split(""));
      var options = {
        endpoint: "/uploads",
        uploadUrl: "/files/upload",
        overridePatchMethod: true
      };

      var upload = new tus.Upload(file, options);
      upload.start();

      var req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("/files/upload");
      expect(req.method).toBe("HEAD");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");

      req.respondWith({
        status: 204,
        responseHeaders: {
          "Upload-Length": 11,
          "Upload-Offset": 3
        }
      });

      req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("/files/upload");
      expect(req.method).toBe("POST");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
      expect(req.requestHeaders["Upload-Offset"]).toBe(3);
      expect(req.requestHeaders["X-HTTP-Method-Override"]).toBe("PATCH");

      req.respondWith({
        status: 204,
        responseHeaders: {
          "Upload-Offset": 11
        }
      });

      done();
    });
  });
});
