#define _POSIX_C_SOURCE 200809L
#define CURL_DISABLE_TYPECHECK
#include <curl/curl.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

static int failures;
static size_t received;
static size_t upload_offset, upload_size = 6;
static int abort_upload;
#define EXPECT(expression, expected) do { \
  CURLcode actual = (expression); \
  if (actual != (expected)) { \
    fprintf(stderr, "CURL FAIL line %d: %s returned %d, expected %d\n", \
            __LINE__, #expression, actual, (expected)); \
    ++failures; \
  } \
} while (0)
#define UNSUPPORTED(option, value) \
  EXPECT(curl_easy_setopt(curl, option, value), CURLE_NOT_BUILT_IN)

static size_t write_body(char *bytes, size_t size, size_t count, void *context) {
  (void)bytes;
  if (context != NULL) ++failures; /* Explicit NULL must reach a custom callback. */
  received += size * count;
  return size * count;
}

static size_t read_body(char *bytes, size_t size, size_t count, void *context) {
  (void)context;
  if (abort_upload) return CURL_READFUNC_ABORT;
  size_t length = size * count;
  if (length > upload_size - upload_offset) length = upload_size - upload_offset;
  memcpy(bytes, &"abcdef"[upload_offset], length);
  upload_offset += length;
  return length;
}

static size_t reject_data(char *bytes, size_t size, size_t count, void *context) {
  (void)bytes; (void)size; (void)count; (void)context;
  return 0;
}

static double now(void) {
  struct timespec value;
  clock_gettime(CLOCK_MONOTONIC, &value);
  return value.tv_sec + value.tv_nsec / 1e9;
}

int main(int argc, char **argv) {
  if (argc != 2) return 2;
  CURL *curl = curl_easy_init();
  if (curl == NULL) return 2;
  char denied_url[1024], error_buffer[CURL_ERROR_SIZE];
  const char *path = strstr(argv[1], "/fixture/");
  if (path == NULL) return 2;
  snprintf(denied_url, sizeof(denied_url), "%.*s/not-allowed", (int)(path - argv[1]), argv[1]);
  EXPECT(curl_easy_setopt(curl, CURLOPT_URL, denied_url), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_ERRORBUFFER, error_buffer), CURLE_OK);
  EXPECT(curl_easy_perform(curl), CURLE_REMOTE_ACCESS_DENIED);
  if (strstr(error_buffer, "policy denied") == NULL) ++failures;
  EXPECT(curl_easy_setopt(curl, CURLOPT_ERRORBUFFER, NULL), CURLE_OK);
  UNSUPPORTED(CURLOPT_PROXY, "http://proxy.invalid");
  UNSUPPORTED(CURLOPT_NOPROXY, "example.com");
  UNSUPPORTED(CURLOPT_PROXYAUTH, CURLAUTH_BASIC);
  UNSUPPORTED(CURLOPT_PROXYUSERNAME, "user");
  UNSUPPORTED(CURLOPT_PROXYPASSWORD, "password");
  UNSUPPORTED(CURLOPT_CAINFO, "/cert.pem");
  UNSUPPORTED(CURLOPT_CAPATH, "/certs");
  UNSUPPORTED(CURLOPT_PROXY_CAINFO, "/proxy.pem");
  UNSUPPORTED(CURLOPT_SSLCERT, "/cert.pem");
  UNSUPPORTED(CURLOPT_SSLKEY, "/key.pem");
  UNSUPPORTED(CURLOPT_PINNEDPUBLICKEY, "sha256//fixture");
  UNSUPPORTED(CURLOPT_SSL_VERIFYPEER, 0L);
  UNSUPPORTED(CURLOPT_SSL_VERIFYHOST, 0L);
  UNSUPPORTED(CURLOPT_SSLVERSION, (long)CURL_SSLVERSION_TLSv1_2);
  UNSUPPORTED(CURLOPT_SSL_OPTIONS, (long)CURLSSLOPT_NO_REVOKE);
  UNSUPPORTED(CURLOPT_SSL_CIPHER_LIST, "cipher");
  UNSUPPORTED(CURLOPT_HTTP_VERSION, (long)CURL_HTTP_VERSION_1_1);
  UNSUPPORTED(CURLOPT_NETRC, (long)CURL_NETRC_REQUIRED);
  UNSUPPORTED(CURLOPT_HTTPAUTH, CURLAUTH_DIGEST);
  UNSUPPORTED(CURLOPT_HTTPAUTH, CURLAUTH_ANY);
  UNSUPPORTED(CURLOPT_COOKIEFILE, "/cookies");
  UNSUPPORTED(CURLOPT_COOKIEJAR, "/cookies");
  UNSUPPORTED(CURLOPT_LOGIN_OPTIONS, "AUTH=PLAIN");
  UNSUPPORTED(CURLOPT_XOAUTH2_BEARER, "fixture-token");
  UNSUPPORTED(CURLOPT_MAXREDIRS, 2L);
  UNSUPPORTED(CURLOPT_POSTREDIR, (long)CURL_REDIR_POST_ALL);
  UNSUPPORTED(CURLOPT_REDIR_PROTOCOLS_STR, "https");
  UNSUPPORTED(CURLOPT_LOW_SPEED_LIMIT, 1L);
  UNSUPPORTED(CURLOPT_LOW_SPEED_TIME, 1L);
  UNSUPPORTED(CURLOPT_TIMEOUT, 1L);
  UNSUPPORTED(CURLOPT_CONNECTTIMEOUT_MS, 10L);
  UNSUPPORTED(CURLOPT_TCP_KEEPALIVE, 1L);
  UNSUPPORTED(CURLOPT_IPRESOLVE, (long)CURL_IPRESOLVE_V4);
  UNSUPPORTED(CURLOPT_PORT, 1234L);
  UNSUPPORTED(CURLOPT_SEEKDATA, (void *)1);
  EXPECT(curl_global_trace("all"), CURLE_NOT_BUILT_IN);
  EXPECT(curl_easy_setopt(curl, (CURLoption)99999, 0L), CURLE_UNKNOWN_OPTION);
  curl_easy_cleanup(curl);
  curl = curl_easy_init();
  if (curl == NULL) return 2;
  EXPECT(curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 2L), CURLE_OK);

  EXPECT(curl_easy_setopt(curl, CURLOPT_URL, argv[1]), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_body), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_WRITEDATA, NULL), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_POSTFIELDS, "payload"), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_PROTOCOLS_STR, "HtTpS"), CURLE_OK);
  EXPECT(curl_easy_perform(curl), CURLE_UNSUPPORTED_PROTOCOL);
  CURL *copy = curl_easy_duphandle(curl);
  if (copy == NULL) return 2;
  EXPECT(curl_easy_perform(copy), CURLE_UNSUPPORTED_PROTOCOL);
  curl_easy_cleanup(copy);
  EXPECT(curl_easy_setopt(curl, CURLOPT_PROTOCOLS_STR, "http,ftp"), CURLE_UNSUPPORTED_PROTOCOL);
  EXPECT(curl_easy_setopt(curl, CURLOPT_PROTOCOLS_STR, ""), CURLE_BAD_FUNCTION_ARGUMENT);
  EXPECT(curl_easy_perform(curl), CURLE_UNSUPPORTED_PROTOCOL);
  EXPECT(curl_easy_setopt(curl, CURLOPT_PROTOCOLS_STR, NULL), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_PROTOCOLS_STR, "HTTP,https"), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_USERPWD, "user:pass"), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_HTTPAUTH, CURLAUTH_NONE), CURLE_OK);
  EXPECT(curl_easy_perform(curl), CURLE_OK);
  long status = 0;
  EXPECT(curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &status), CURLE_OK);
  if (status != 200 || received == 0) ++failures;
  EXPECT(curl_easy_setopt(curl, CURLOPT_PROTOCOLS_STR, "ALL"), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_HTTPAUTH, CURLAUTH_BASIC), CURLE_OK);
  EXPECT(curl_easy_perform(curl), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_HTTPAUTH, CURLAUTH_NONE), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_POSTFIELDS, NULL), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_UPLOAD, 1L), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, "POST"), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_READFUNCTION, read_body), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_INFILESIZE_LARGE, (curl_off_t)3), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_INFILESIZE_LARGE, (curl_off_t)-2), CURLE_BAD_FUNCTION_ARGUMENT);
  EXPECT(curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE_LARGE, (curl_off_t)-2), CURLE_BAD_FUNCTION_ARGUMENT);
  EXPECT(curl_easy_perform(curl), CURLE_OK);
  if (upload_offset != 3) { fputs("CURL FAIL: upload consumed beyond declared size\n", stderr); ++failures; }
  upload_offset = 0;
  EXPECT(curl_easy_setopt(curl, CURLOPT_INFILESIZE_LARGE, (curl_off_t)0), CURLE_OK);
  EXPECT(curl_easy_perform(curl), CURLE_OK);
  if (upload_offset != 0) { fputs("CURL FAIL: zero-sized upload consumed input\n", stderr); ++failures; }
  upload_offset = 0;
  upload_size = 2;
  EXPECT(curl_easy_setopt(curl, CURLOPT_INFILESIZE_LARGE, (curl_off_t)3), CURLE_OK);
  EXPECT(curl_easy_perform(curl), CURLE_READ_ERROR);
  abort_upload = 1;
  EXPECT(curl_easy_perform(curl), CURLE_ABORTED_BY_CALLBACK);
  abort_upload = 0;
  upload_offset = 0;
  upload_size = 6;
  EXPECT(curl_easy_setopt(curl, CURLOPT_POST, 1L), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE_LARGE, (curl_off_t)2), CURLE_OK);
  EXPECT(curl_easy_perform(curl), CURLE_OK);
  if (upload_offset != 2) ++failures;
  EXPECT(curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, NULL), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_UPLOAD, 1L), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_POSTFIELDS, "payload"), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE_LARGE, (curl_off_t)7), CURLE_OK);
  EXPECT(curl_easy_perform(curl), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_HTTPGET, 1L), CURLE_OK);
  EXPECT(curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, "POST"), CURLE_OK);
  EXPECT(curl_easy_perform(curl), CURLE_OK);
  for (int header = 0; header < 2; ++header) {
    char url[4096];
    snprintf(url, sizeof(url), "%s?cancel=%s", argv[1], header ? "header" : "body");
    EXPECT(curl_easy_setopt(curl, CURLOPT_URL, url), CURLE_OK);
    EXPECT(curl_easy_setopt(curl, header ? CURLOPT_HEADERFUNCTION : CURLOPT_WRITEFUNCTION, reject_data), CURLE_OK);
    const double started = now();
    EXPECT(curl_easy_perform(curl), CURLE_WRITE_ERROR);
    if (now() - started > 0.7) { fputs("CURL FAIL: rejected callback waited for the rest of the response\n", stderr); ++failures; }
    EXPECT(curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &status), CURLE_OK);
    char *effective = NULL;
    EXPECT(curl_easy_getinfo(curl, CURLINFO_EFFECTIVE_URL, &effective), CURLE_OK);
    if (status != 200 || effective == NULL || strcmp(effective, url) != 0) {
      fputs("CURL FAIL: rejected callback lost received response metadata\n", stderr);
      ++failures;
    }
  }
  EXPECT(curl_easy_setopt(curl, CURLOPT_PROTOCOLS_STR, "https"), CURLE_OK);
  EXPECT(curl_easy_perform(curl), CURLE_UNSUPPORTED_PROTOCOL);
  EXPECT(curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &status), CURLE_OK);
  char *effective = NULL;
  EXPECT(curl_easy_getinfo(curl, CURLINFO_EFFECTIVE_URL, &effective), CURLE_OK);
  if (status != 0 || effective != NULL) ++failures;
  curl_easy_cleanup(curl);
  if (failures) { fprintf(stderr, "CURL-CONTRACT: %d failures\n", failures); return 1; }
  CURLM *multi = curl_multi_init();
  CURL *peers[2] = {curl_easy_init(), curl_easy_init()};
  char overlap[1024];
  for (int index = 0; index < 2; ++index) {
    snprintf(overlap, sizeof(overlap), "%.*s/fixture/http-overlap?group=curl&request=%d", (int)(path - argv[1]), argv[1], index);
    EXPECT(curl_easy_setopt(peers[index], CURLOPT_URL, overlap), CURLE_OK);
    EXPECT(curl_easy_setopt(peers[index], CURLOPT_WRITEFUNCTION, write_body), CURLE_OK);
    EXPECT(curl_easy_setopt(peers[index], CURLOPT_WRITEDATA, NULL), CURLE_OK);
    EXPECT(curl_multi_add_handle(multi, peers[index]), CURLM_OK);
  }
  int running = 2, messages = 0, remaining;
  const double started = now();
  do {
    EXPECT(curl_multi_perform(multi, &running), CURLM_OK);
    if (now() - started > 5) { fprintf(stderr, "CURL FAIL: %d concurrent transfers timed out\n", running); ++failures; break; }
    if (running) nanosleep(&(struct timespec){.tv_nsec = 10000000}, NULL);
  } while (running);
  CURLMsg *message;
  while ((message = curl_multi_info_read(multi, &remaining)) != NULL) {
    ++messages;
    EXPECT(message->data.result, CURLE_OK);
    EXPECT(curl_easy_getinfo(message->easy_handle, CURLINFO_RESPONSE_CODE, &status), CURLE_OK);
    if (status != 200) { fprintf(stderr, "CURL FAIL: overlap HTTP status %ld\n", status); ++failures; }
  }
  if (messages != 2) { fprintf(stderr, "CURL FAIL: %d completion messages, expected 2\n", messages); ++failures; }
  for (int index = 0; index < 2; ++index) {
    curl_multi_remove_handle(multi, peers[index]); curl_easy_cleanup(peers[index]);
  }
  curl_multi_cleanup(multi);
  if (failures) { fprintf(stderr, "CURL-MULTI: %d failures\n", failures); return 1; }
  puts("CURL-CONTRACT-OK");
  return 0;
}
