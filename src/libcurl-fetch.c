#define CURL_DISABLE_TYPECHECK
#include <curl/curl.h>

#include <ctype.h>
#include <errno.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

#include <dolly/http.h>

#define DOLLY_EASY_MAGIC 0x4355524cu
#define DOLLY_MULTI_MAGIC 0x4d554c54u

typedef struct {
  uint32_t magic;
  char *url;
  char *custom_method;
  char *user_agent;
  char *accept_encoding;
  char *range;
  char *username;
  char *password;
  char *userpwd;
  char *protocols;
  char *redirect_protocols;
  char *pinned_public_key;
  struct curl_slist *headers;
  const void *post_fields;
  curl_off_t post_size;
  curl_off_t input_size;
  long follow;
  long fail_on_error;
  long nobody;
  long post;
  long upload;
  long verbose;
  curl_write_callback write_function;
  void *write_data;
  curl_write_callback header_function;
  void *header_data;
  curl_read_callback read_function;
  void *read_data;
  curl_seek_callback seek_function;
  void *seek_data;
  curl_debug_callback debug_function;
  void *debug_data;
  char *error_buffer;
  long response_code;
  long connect_code;
  long auth_available;
  curl_off_t retry_after;
  char *effective_url;
  char *content_type;
} DollyEasy;

typedef struct DollyMultiEntry {
  DollyEasy *easy;
  CURLcode result;
  int complete;
  int reported;
  struct DollyMultiEntry *next;
} DollyMultiEntry;

typedef struct {
  uint32_t magic;
  DollyMultiEntry *entries;
  CURLMsg message;
} DollyMulti;

typedef struct {
  DollyEasy *easy;
  dolly_http_response *response;
} CallbackContext;

static int valid_easy(const DollyEasy *easy) {
  return easy != NULL && easy->magic == DOLLY_EASY_MAGIC;
}

static int valid_multi(const DollyMulti *multi) {
  return multi != NULL && multi->magic == DOLLY_MULTI_MAGIC;
}

static int replace_string(char **target, const char *value) {
  char *copy = value == NULL ? NULL : strdup(value);
  if (value != NULL && copy == NULL) return 0;
  free(*target);
  *target = copy;
  return 1;
}

static void reset_result(DollyEasy *easy) {
  easy->response_code = 0;
  easy->connect_code = 0;
  easy->auth_available = 0;
  easy->retry_after = 0;
  free(easy->effective_url);
  easy->effective_url = NULL;
  free(easy->content_type);
  easy->content_type = NULL;
  if (easy->error_buffer != NULL) easy->error_buffer[0] = '\0';
}

static void destroy_easy(DollyEasy *easy) {
  if (!valid_easy(easy)) return;
  free(easy->url);
  free(easy->custom_method);
  free(easy->user_agent);
  free(easy->accept_encoding);
  free(easy->range);
  free(easy->username);
  free(easy->password);
  free(easy->userpwd);
  free(easy->protocols);
  free(easy->redirect_protocols);
  free(easy->pinned_public_key);
  free(easy->effective_url);
  free(easy->content_type);
  easy->magic = 0;
  free(easy);
}

static size_t default_write(char *bytes, size_t size, size_t count,
                            void *stream) {
  FILE *file = stream == NULL ? stdout : stream;
  return fwrite(bytes, size, count, file);
}

static size_t perform_write(const void *bytes, size_t length, void *context) {
  CallbackContext *callback = context;
  DollyEasy *easy = callback->easy;
  if (easy->fail_on_error && callback->response->status >= 400) return length;
  if (easy->debug_function != NULL && easy->verbose) {
    easy->debug_function((CURL *)easy, CURLINFO_DATA_IN, (char *)bytes,
                         length, easy->debug_data);
  }
  curl_write_callback write = easy->write_function == NULL
                                   ? default_write
                                   : easy->write_function;
  void *data = easy->write_data == NULL ? stdout : easy->write_data;
  return write((char *)bytes, 1, length, data);
}

static void capture_header(DollyEasy *easy, const char *bytes, size_t length) {
  static const char content_type[] = "content-type:";
  static const char retry_after[] = "retry-after:";
  if (length > sizeof(content_type) - 1 &&
      strncasecmp(bytes, content_type, sizeof(content_type) - 1) == 0) {
    const char *value = bytes + sizeof(content_type) - 1;
    const char *end = bytes + length;
    while (value < end && isspace((unsigned char)*value)) value++;
    while (end > value && isspace((unsigned char)end[-1])) end--;
    char *copy = strndup(value, (size_t)(end - value));
    if (copy != NULL) {
      free(easy->content_type);
      easy->content_type = copy;
    }
  } else if (length > sizeof(retry_after) - 1 &&
             strncasecmp(bytes, retry_after, sizeof(retry_after) - 1) == 0) {
    const char *value = bytes + sizeof(retry_after) - 1;
    while ((size_t)(value - bytes) < length &&
           isspace((unsigned char)*value)) value++;
    char *end = NULL;
    long long parsed = strtoll(value, &end, 10);
    if (end != value && parsed >= 0) easy->retry_after = parsed;
  }
}

static size_t perform_header(const void *bytes, size_t length, void *context) {
  CallbackContext *callback = context;
  DollyEasy *easy = callback->easy;
  capture_header(easy, bytes, length);
  if (easy->debug_function != NULL && easy->verbose) {
    easy->debug_function((CURL *)easy, CURLINFO_HEADER_IN, (char *)bytes,
                         length, easy->debug_data);
  }
  if (easy->header_function == NULL) return length;
  return easy->header_function((char *)bytes, 1, length, easy->header_data);
}

static int append_bytes(char **buffer, size_t *length, size_t *capacity,
                        const void *bytes, size_t count) {
  if (count > SIZE_MAX - *length - 1) return 0;
  size_t needed = *length + count + 1;
  if (needed > *capacity) {
    size_t grown = *capacity == 0 ? 256 : *capacity;
    while (grown < needed) {
      if (grown > SIZE_MAX / 2) {
        grown = needed;
        break;
      }
      grown *= 2;
    }
    char *next = realloc(*buffer, grown);
    if (next == NULL) return 0;
    *buffer = next;
    *capacity = grown;
  }
  memcpy(*buffer + *length, bytes, count);
  *length += count;
  (*buffer)[*length] = '\0';
  return 1;
}

static int append_header(char **buffer, size_t *length, size_t *capacity,
                         const char *line) {
  if (line == NULL || line[0] == '\0') return 1;
  const char *colon = strchr(line, ':');
  if (colon == NULL) return 1;
  size_t name_length = (size_t)(colon - line);
  if ((name_length == 14 && strncasecmp(line, "content-length", 14) == 0) ||
      (name_length == 17 && strncasecmp(line, "transfer-encoding", 17) == 0) ||
      (name_length == 4 && strncasecmp(line, "host", 4) == 0)) {
    return 1;
  }
  return append_bytes(buffer, length, capacity, line, strlen(line)) &&
         append_bytes(buffer, length, capacity, "\r\n", 2);
}

static char *basic_authorization(const DollyEasy *easy) {
  const char *username = easy->username;
  const char *password = easy->password;
  const char *combined = easy->userpwd;
  char *temporary = NULL;
  if (combined == NULL && username != NULL) {
    size_t user_length = strlen(username);
    size_t password_length = password == NULL ? 0 : strlen(password);
    temporary = malloc(user_length + password_length + 2);
    if (temporary == NULL) return NULL;
    memcpy(temporary, username, user_length);
    temporary[user_length] = ':';
    if (password_length != 0) {
      memcpy(temporary + user_length + 1, password, password_length);
    }
    temporary[user_length + password_length + 1] = '\0';
    combined = temporary;
  }
  if (combined == NULL) return NULL;

  static const char alphabet[] =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  size_t input_length = strlen(combined);
  size_t encoded_length = 4 * ((input_length + 2) / 3);
  char *header = malloc(sizeof("Authorization: Basic ") + encoded_length);
  if (header == NULL) {
    free(temporary);
    return NULL;
  }
  memcpy(header, "Authorization: Basic ", sizeof("Authorization: Basic ") - 1);
  char *output = header + sizeof("Authorization: Basic ") - 1;
  for (size_t offset = 0, encoded = 0; offset < input_length; offset += 3) {
    uint32_t value = (uint32_t)(unsigned char)combined[offset] << 16;
    if (offset + 1 < input_length)
      value |= (uint32_t)(unsigned char)combined[offset + 1] << 8;
    if (offset + 2 < input_length)
      value |= (unsigned char)combined[offset + 2];
    output[encoded++] = alphabet[(value >> 18) & 63];
    output[encoded++] = alphabet[(value >> 12) & 63];
    output[encoded++] = offset + 1 < input_length ? alphabet[(value >> 6) & 63] : '=';
    output[encoded++] = offset + 2 < input_length ? alphabet[value & 63] : '=';
  }
  output[encoded_length] = '\0';
  free(temporary);
  return header;
}

static CURLcode collect_upload(DollyEasy *easy, unsigned char **body,
                               size_t *body_size) {
  if (easy->post_fields != NULL) {
    size_t length = easy->post_size < 0
                        ? strlen((const char *)easy->post_fields)
                        : (size_t)easy->post_size;
    if ((curl_off_t)length != easy->post_size && easy->post_size >= 0)
      return CURLE_OUT_OF_MEMORY;
    *body = malloc(length == 0 ? 1 : length);
    if (*body == NULL) return CURLE_OUT_OF_MEMORY;
    memcpy(*body, easy->post_fields, length);
    *body_size = length;
    return CURLE_OK;
  }
  if (!easy->post && !easy->upload) return CURLE_OK;

  curl_read_callback read_callback = easy->read_function;
  void *read_data = easy->read_data;
  size_t capacity = easy->input_size > 0 &&
                            (uint64_t)easy->input_size <= SIZE_MAX
                        ? (size_t)easy->input_size
                        : 65536;
  if (capacity == 0) capacity = 1;
  unsigned char *result = malloc(capacity);
  if (result == NULL) return CURLE_OUT_OF_MEMORY;
  size_t length = 0;
  for (;;) {
    if (capacity - length < 16384) {
      if (capacity > SIZE_MAX / 2) {
        free(result);
        return CURLE_OUT_OF_MEMORY;
      }
      capacity *= 2;
      unsigned char *grown = realloc(result, capacity);
      if (grown == NULL) {
        free(result);
        return CURLE_OUT_OF_MEMORY;
      }
      result = grown;
    }
    size_t count = read_callback == NULL
                       ? fread(result + length, 1, capacity - length,
                               read_data == NULL ? stdin : read_data)
                       : read_callback((char *)result + length, 1,
                                       capacity - length, read_data);
    if (count == CURL_READFUNC_ABORT || count == CURL_READFUNC_PAUSE ||
        count > capacity - length) {
      free(result);
      return CURLE_READ_ERROR;
    }
    if (count == 0) break;
    length += count;
    if (easy->input_size >= 0 && (curl_off_t)length >= easy->input_size) break;
  }
  *body = result;
  *body_size = length;
  return CURLE_OK;
}

static CURLcode map_http_error(int error) {
  if (error == -ENOMEM || error == -EOVERFLOW) return CURLE_OUT_OF_MEMORY;
  if (error == -EPROTONOSUPPORT) return CURLE_UNSUPPORTED_PROTOCOL;
  if (error == -ECANCELED) return CURLE_WRITE_ERROR;
  if (error == -EINVAL) return CURLE_BAD_FUNCTION_ARGUMENT;
  return CURLE_COULDNT_CONNECT;
}

CURLcode curl_global_init(long flags) {
  (void)flags;
  return CURLE_OK;
}

void curl_global_cleanup(void) {}

CURLcode curl_global_trace(const char *config) {
  (void)config;
  return CURLE_OK;
}

CURLsslset curl_global_sslset(curl_sslbackend id, const char *name,
                              const curl_ssl_backend ***available) {
  (void)id;
  (void)name;
  if (available != NULL) *available = NULL;
  return CURLSSLSET_NO_BACKENDS;
}

CURL *curl_easy_init(void) {
  DollyEasy *easy = calloc(1, sizeof(*easy));
  if (easy == NULL) return NULL;
  easy->magic = DOLLY_EASY_MAGIC;
  easy->post_size = -1;
  easy->input_size = -1;
  return (CURL *)easy;
}

void curl_easy_cleanup(CURL *handle) {
  destroy_easy((DollyEasy *)handle);
}

CURL *curl_easy_duphandle(CURL *handle) {
  DollyEasy *source = (DollyEasy *)handle;
  if (!valid_easy(source)) return NULL;
  DollyEasy *copy = curl_easy_init();
  if (copy == NULL) return NULL;
  uint32_t magic = copy->magic;
  *copy = *source;
  copy->magic = magic;
  copy->url = NULL;
  copy->custom_method = NULL;
  copy->user_agent = NULL;
  copy->accept_encoding = NULL;
  copy->range = NULL;
  copy->username = NULL;
  copy->password = NULL;
  copy->userpwd = NULL;
  copy->protocols = NULL;
  copy->redirect_protocols = NULL;
  copy->pinned_public_key = NULL;
  copy->effective_url = NULL;
  copy->content_type = NULL;
  if (!replace_string(&copy->url, source->url) ||
      !replace_string(&copy->custom_method, source->custom_method) ||
      !replace_string(&copy->user_agent, source->user_agent) ||
      !replace_string(&copy->accept_encoding, source->accept_encoding) ||
      !replace_string(&copy->range, source->range) ||
      !replace_string(&copy->username, source->username) ||
      !replace_string(&copy->password, source->password) ||
      !replace_string(&copy->userpwd, source->userpwd) ||
      !replace_string(&copy->protocols, source->protocols) ||
      !replace_string(&copy->redirect_protocols, source->redirect_protocols) ||
      !replace_string(&copy->pinned_public_key, source->pinned_public_key)) {
    destroy_easy(copy);
    return NULL;
  }
  reset_result(copy);
  return (CURL *)copy;
}

CURLcode curl_easy_setopt(CURL *handle, CURLoption option, ...) {
  DollyEasy *easy = (DollyEasy *)handle;
  if (!valid_easy(easy)) return CURLE_BAD_FUNCTION_ARGUMENT;
  va_list arguments;
  va_start(arguments, option);
  CURLcode result = CURLE_OK;
#define STRING_OPTION(field) \
  do { if (!replace_string(&easy->field, va_arg(arguments, const char *))) \
         result = CURLE_OUT_OF_MEMORY; } while (0)
  switch (option) {
    case CURLOPT_URL: STRING_OPTION(url); break;
    case CURLOPT_CUSTOMREQUEST: STRING_OPTION(custom_method); break;
    case CURLOPT_USERAGENT: STRING_OPTION(user_agent); break;
    case CURLOPT_ACCEPT_ENCODING: STRING_OPTION(accept_encoding); break;
    case CURLOPT_RANGE: STRING_OPTION(range); break;
    case CURLOPT_USERNAME: STRING_OPTION(username); break;
    case CURLOPT_PASSWORD: STRING_OPTION(password); break;
    case CURLOPT_USERPWD: STRING_OPTION(userpwd); break;
    case CURLOPT_PROTOCOLS_STR: STRING_OPTION(protocols); break;
    case CURLOPT_REDIR_PROTOCOLS_STR: STRING_OPTION(redirect_protocols); break;
    case CURLOPT_PINNEDPUBLICKEY: STRING_OPTION(pinned_public_key); break;
    case CURLOPT_WRITEDATA: easy->write_data = va_arg(arguments, void *); break;
    case CURLOPT_HEADERDATA: easy->header_data = va_arg(arguments, void *); break;
    case CURLOPT_READDATA: easy->read_data = va_arg(arguments, void *); break;
    case CURLOPT_SEEKDATA: easy->seek_data = va_arg(arguments, void *); break;
    case CURLOPT_DEBUGDATA: easy->debug_data = va_arg(arguments, void *); break;
    case CURLOPT_ERRORBUFFER: easy->error_buffer = va_arg(arguments, char *); break;
    case CURLOPT_POSTFIELDS: easy->post_fields = va_arg(arguments, const void *); easy->post = 1; break;
    case CURLOPT_HTTPHEADER: easy->headers = va_arg(arguments, struct curl_slist *); break;
    case CURLOPT_WRITEFUNCTION: easy->write_function = va_arg(arguments, curl_write_callback); break;
    case CURLOPT_HEADERFUNCTION: easy->header_function = va_arg(arguments, curl_write_callback); break;
    case CURLOPT_READFUNCTION: easy->read_function = va_arg(arguments, curl_read_callback); break;
    case CURLOPT_SEEKFUNCTION: easy->seek_function = va_arg(arguments, curl_seek_callback); break;
    case CURLOPT_DEBUGFUNCTION: easy->debug_function = va_arg(arguments, curl_debug_callback); break;
    case CURLOPT_POSTFIELDSIZE: easy->post_size = va_arg(arguments, long); break;
    case CURLOPT_POSTFIELDSIZE_LARGE: easy->post_size = va_arg(arguments, curl_off_t); break;
    case CURLOPT_INFILESIZE_LARGE: easy->input_size = va_arg(arguments, curl_off_t); break;
    case CURLOPT_FOLLOWLOCATION: easy->follow = va_arg(arguments, long); break;
    case CURLOPT_FAILONERROR: easy->fail_on_error = va_arg(arguments, long); break;
    case CURLOPT_NOBODY: easy->nobody = va_arg(arguments, long); break;
    case CURLOPT_POST: easy->post = va_arg(arguments, long); if (easy->post) easy->upload = 0; break;
    case CURLOPT_UPLOAD: easy->upload = va_arg(arguments, long); if (easy->upload) easy->post = 0; break;
    case CURLOPT_HTTPGET:
      if (va_arg(arguments, long)) { easy->post = 0; easy->upload = 0; easy->nobody = 0; }
      break;
    case CURLOPT_VERBOSE: easy->verbose = va_arg(arguments, long); break;

    case CURLOPT_SSL_VERIFYPEER:
    case CURLOPT_SSL_VERIFYHOST:
    case CURLOPT_HTTP_VERSION:
    case CURLOPT_NETRC:
    case CURLOPT_HTTPAUTH:
    case CURLOPT_PROXYAUTH:
    case CURLOPT_LOW_SPEED_LIMIT:
    case CURLOPT_LOW_SPEED_TIME:
    case CURLOPT_MAXREDIRS:
    case CURLOPT_POSTREDIR:
    case CURLOPT_IPRESOLVE:
    case CURLOPT_FTP_USE_EPSV:
    case CURLOPT_USE_SSL:
    case CURLOPT_TCP_KEEPALIVE:
    case CURLOPT_TCP_KEEPIDLE:
    case CURLOPT_TCP_KEEPINTVL:
    case CURLOPT_TCP_KEEPCNT:
    case CURLOPT_SSLVERSION:
    case CURLOPT_SSL_OPTIONS:
    case CURLOPT_PORT:
      (void)va_arg(arguments, long);
      break;

    case CURLOPT_PROXY:
    case CURLOPT_NOPROXY:
    case CURLOPT_PROXYUSERNAME:
    case CURLOPT_PROXYPASSWORD:
    case CURLOPT_PROXY_CAINFO:
    case CURLOPT_PROXY_SSLCERT:
    case CURLOPT_PROXY_SSLKEY:
    case CURLOPT_PROXY_KEYPASSWD:
    case CURLOPT_SSLCERT:
    case CURLOPT_SSLCERTTYPE:
    case CURLOPT_SSLKEY:
    case CURLOPT_SSLKEYTYPE:
    case CURLOPT_KEYPASSWD:
    case CURLOPT_CAPATH:
    case CURLOPT_CAINFO:
    case CURLOPT_SSL_CIPHER_LIST:
    case CURLOPT_COOKIEFILE:
    case CURLOPT_COOKIEJAR:
    case CURLOPT_LOGIN_OPTIONS:
    case CURLOPT_XOAUTH2_BEARER:
      (void)va_arg(arguments, const char *);
      break;
    case CURLOPT_PROXYHEADER:
    case CURLOPT_RESOLVE:
      (void)va_arg(arguments, struct curl_slist *);
      break;
    default:
      result = CURLE_UNKNOWN_OPTION;
      break;
  }
#undef STRING_OPTION
  va_end(arguments);
  return result;
}

CURLcode curl_easy_perform(CURL *handle) {
  DollyEasy *easy = (DollyEasy *)handle;
  if (!valid_easy(easy) || easy->url == NULL) return CURLE_URL_MALFORMAT;
  reset_result(easy);
  if (easy->pinned_public_key != NULL) return CURLE_NOT_BUILT_IN;
  if (strncasecmp(easy->url, "http://", 7) != 0 &&
      strncasecmp(easy->url, "https://", 8) != 0 && easy->url[0] != '/') {
    return CURLE_UNSUPPORTED_PROTOCOL;
  }

  unsigned char *body = NULL;
  size_t body_size = 0;
  CURLcode result = collect_upload(easy, &body, &body_size);
  if (result != CURLE_OK) return result;

  char *headers = NULL;
  size_t headers_length = 0;
  size_t headers_capacity = 0;
  for (struct curl_slist *line = easy->headers; line != NULL; line = line->next) {
    if (!append_header(&headers, &headers_length, &headers_capacity, line->data))
      result = CURLE_OUT_OF_MEMORY;
  }
  if (result == CURLE_OK && easy->user_agent != NULL) {
    char *line = NULL;
    size_t length = strlen(easy->user_agent) + sizeof("User-Agent: ");
    line = malloc(length);
    if (line == NULL) result = CURLE_OUT_OF_MEMORY;
    else {
      snprintf(line, length, "User-Agent: %s", easy->user_agent);
      if (!append_header(&headers, &headers_length, &headers_capacity, line))
        result = CURLE_OUT_OF_MEMORY;
      free(line);
    }
  }
  if (result == CURLE_OK && easy->accept_encoding != NULL) {
    const char *value = easy->accept_encoding[0] == '\0'
                            ? "gzip, deflate"
                            : easy->accept_encoding;
    size_t length = strlen(value) + sizeof("Accept-Encoding: ");
    char *line = malloc(length);
    if (line == NULL) result = CURLE_OUT_OF_MEMORY;
    else {
      snprintf(line, length, "Accept-Encoding: %s", value);
      if (!append_header(&headers, &headers_length, &headers_capacity, line))
        result = CURLE_OUT_OF_MEMORY;
      free(line);
    }
  }
  if (result == CURLE_OK && easy->range != NULL) {
    size_t length = strlen(easy->range) + sizeof("Range: bytes=");
    char *line = malloc(length);
    if (line == NULL) result = CURLE_OUT_OF_MEMORY;
    else {
      snprintf(line, length, "Range: bytes=%s", easy->range);
      if (!append_header(&headers, &headers_length, &headers_capacity, line))
        result = CURLE_OUT_OF_MEMORY;
      free(line);
    }
  }
  char *authorization = basic_authorization(easy);
  if (result == CURLE_OK && authorization != NULL &&
      !append_header(&headers, &headers_length, &headers_capacity,
                     authorization)) {
    result = CURLE_OUT_OF_MEMORY;
  }
  free(authorization);
  if (result != CURLE_OK) {
    free(headers);
    free(body);
    return result;
  }

  const char *method = easy->custom_method != NULL ? easy->custom_method :
                       easy->nobody ? "HEAD" :
                       easy->upload ? "PUT" :
                       easy->post ? "POST" : "GET";
  if (easy->debug_function != NULL && easy->verbose) {
    easy->debug_function((CURL *)easy, CURLINFO_HEADER_OUT,
                         headers == NULL ? "" : headers,
                         headers_length, easy->debug_data);
    if (body_size != 0) {
      easy->debug_function((CURL *)easy, CURLINFO_DATA_OUT, (char *)body,
                           body_size, easy->debug_data);
    }
  }

  dolly_http_response response = {0};
  CallbackContext callback = {.easy = easy, .response = &response};
  dolly_http_request request = {
      .method = method,
      .url = easy->url,
      .headers = headers,
      .body = body,
      .body_size = body_size,
      .flags = easy->follow ? DOLLY_HTTP_FOLLOW_REDIRECTS : 0,
      .write = easy->nobody ? NULL : perform_write,
      .write_context = &callback,
      .header = perform_header,
      .header_context = &callback,
  };
  int status = dolly_http_perform(&request, &response);
  free(headers);
  free(body);
  if (status != 0) {
    result = map_http_error(status);
  } else {
    easy->response_code = response.status;
    easy->effective_url = response.effective_url;
    response.effective_url = NULL;
    if (easy->fail_on_error && easy->response_code >= 400)
      result = CURLE_HTTP_RETURNED_ERROR;
  }
  dolly_http_response_dispose(&response);
  if (result != CURLE_OK && easy->error_buffer != NULL) {
    snprintf(easy->error_buffer, CURL_ERROR_SIZE, "%s", curl_easy_strerror(result));
  }
  return result;
}

CURLcode curl_easy_getinfo(CURL *handle, CURLINFO info, ...) {
  DollyEasy *easy = (DollyEasy *)handle;
  if (!valid_easy(easy)) return CURLE_BAD_FUNCTION_ARGUMENT;
  va_list arguments;
  va_start(arguments, info);
  CURLcode result = CURLE_OK;
  switch (info) {
    case CURLINFO_EFFECTIVE_URL: *va_arg(arguments, char **) = easy->effective_url; break;
    case CURLINFO_CONTENT_TYPE: *va_arg(arguments, char **) = easy->content_type; break;
    case CURLINFO_RESPONSE_CODE: *va_arg(arguments, long *) = easy->response_code; break;
    case CURLINFO_HTTP_CONNECTCODE: *va_arg(arguments, long *) = easy->connect_code; break;
    case CURLINFO_HTTPAUTH_AVAIL: *va_arg(arguments, long *) = easy->auth_available; break;
    case CURLINFO_RETRY_AFTER: *va_arg(arguments, curl_off_t *) = easy->retry_after; break;
    default: result = CURLE_UNKNOWN_OPTION; break;
  }
  va_end(arguments);
  return result;
}

char *curl_easy_escape(CURL *handle, const char *string, int length) {
  (void)handle;
  if (string == NULL || length < 0) return NULL;
  size_t input_length = length == 0 ? strlen(string) : (size_t)length;
  if (input_length > (SIZE_MAX - 1) / 3) return NULL;
  char *encoded = malloc(input_length * 3 + 1);
  if (encoded == NULL) return NULL;
  static const char hex[] = "0123456789ABCDEF";
  size_t output = 0;
  for (size_t index = 0; index < input_length; index++) {
    unsigned char byte = (unsigned char)string[index];
    if (isalnum(byte) || byte == '-' || byte == '.' || byte == '_' || byte == '~') {
      encoded[output++] = (char)byte;
    } else {
      encoded[output++] = '%';
      encoded[output++] = hex[byte >> 4];
      encoded[output++] = hex[byte & 15];
    }
  }
  encoded[output] = '\0';
  return encoded;
}

void curl_free(void *pointer) { free(pointer); }

struct curl_slist *curl_slist_append(struct curl_slist *list,
                                     const char *string) {
  if (string == NULL) return NULL;
  struct curl_slist *node = malloc(sizeof(*node));
  if (node == NULL) return NULL;
  node->data = strdup(string);
  node->next = NULL;
  if (node->data == NULL) {
    free(node);
    return NULL;
  }
  if (list == NULL) return node;
  struct curl_slist *tail = list;
  while (tail->next != NULL) tail = tail->next;
  tail->next = node;
  return list;
}

void curl_slist_free_all(struct curl_slist *list) {
  while (list != NULL) {
    struct curl_slist *next = list->next;
    free(list->data);
    free(list);
    list = next;
  }
}

CURLM *curl_multi_init(void) {
  DollyMulti *multi = calloc(1, sizeof(*multi));
  if (multi != NULL) multi->magic = DOLLY_MULTI_MAGIC;
  return (CURLM *)multi;
}

CURLMcode curl_multi_add_handle(CURLM *multi_handle, CURL *easy_handle) {
  DollyMulti *multi = (DollyMulti *)multi_handle;
  DollyEasy *easy = (DollyEasy *)easy_handle;
  if (!valid_multi(multi)) return CURLM_BAD_HANDLE;
  if (!valid_easy(easy)) return CURLM_BAD_EASY_HANDLE;
  DollyMultiEntry **tail = &multi->entries;
  while (*tail != NULL) {
    if ((*tail)->easy == easy) return CURLM_ADDED_ALREADY;
    tail = &(*tail)->next;
  }
  *tail = calloc(1, sizeof(**tail));
  if (*tail == NULL) return CURLM_OUT_OF_MEMORY;
  (*tail)->easy = easy;
  return CURLM_OK;
}

CURLMcode curl_multi_remove_handle(CURLM *multi_handle, CURL *easy_handle) {
  DollyMulti *multi = (DollyMulti *)multi_handle;
  if (!valid_multi(multi)) return CURLM_BAD_HANDLE;
  DollyMultiEntry **entry = &multi->entries;
  while (*entry != NULL) {
    if ((*entry)->easy == (DollyEasy *)easy_handle) {
      DollyMultiEntry *removed = *entry;
      *entry = removed->next;
      free(removed);
      return CURLM_OK;
    }
    entry = &(*entry)->next;
  }
  return CURLM_BAD_EASY_HANDLE;
}

CURLMcode curl_multi_perform(CURLM *multi_handle, int *running_handles) {
  DollyMulti *multi = (DollyMulti *)multi_handle;
  if (!valid_multi(multi)) return CURLM_BAD_HANDLE;
  if (running_handles == NULL) return CURLM_BAD_FUNCTION_ARGUMENT;
  for (DollyMultiEntry *entry = multi->entries; entry != NULL; entry = entry->next) {
    if (!entry->complete) {
      entry->result = curl_easy_perform((CURL *)entry->easy);
      entry->complete = 1;
    }
  }
  *running_handles = 0;
  return CURLM_OK;
}

CURLMsg *curl_multi_info_read(CURLM *multi_handle, int *messages_in_queue) {
  DollyMulti *multi = (DollyMulti *)multi_handle;
  if (!valid_multi(multi) || messages_in_queue == NULL) return NULL;
  DollyMultiEntry *selected = NULL;
  int count = 0;
  for (DollyMultiEntry *entry = multi->entries; entry != NULL; entry = entry->next) {
    if (entry->complete && !entry->reported) {
      if (selected == NULL) selected = entry;
      count++;
    }
  }
  if (selected == NULL) {
    *messages_in_queue = 0;
    return NULL;
  }
  selected->reported = 1;
  multi->message.msg = CURLMSG_DONE;
  multi->message.easy_handle = (CURL *)selected->easy;
  multi->message.data.result = selected->result;
  *messages_in_queue = count - 1;
  return &multi->message;
}

CURLMcode curl_multi_fdset(CURLM *multi_handle, fd_set *read_fd_set,
                           fd_set *write_fd_set, fd_set *exc_fd_set,
                           int *max_fd) {
  (void)read_fd_set;
  (void)write_fd_set;
  (void)exc_fd_set;
  if (!valid_multi((DollyMulti *)multi_handle)) return CURLM_BAD_HANDLE;
  if (max_fd == NULL) return CURLM_BAD_FUNCTION_ARGUMENT;
  *max_fd = -1;
  return CURLM_OK;
}

CURLMcode curl_multi_timeout(CURLM *multi_handle, long *milliseconds) {
  if (!valid_multi((DollyMulti *)multi_handle)) return CURLM_BAD_HANDLE;
  if (milliseconds == NULL) return CURLM_BAD_FUNCTION_ARGUMENT;
  *milliseconds = 0;
  return CURLM_OK;
}

CURLMcode curl_multi_cleanup(CURLM *multi_handle) {
  DollyMulti *multi = (DollyMulti *)multi_handle;
  if (!valid_multi(multi)) return CURLM_BAD_HANDLE;
  DollyMultiEntry *entry = multi->entries;
  while (entry != NULL) {
    DollyMultiEntry *next = entry->next;
    free(entry);
    entry = next;
  }
  multi->magic = 0;
  free(multi);
  return CURLM_OK;
}

const char *curl_easy_strerror(CURLcode error) {
  switch (error) {
    case CURLE_OK: return "No error";
    case CURLE_UNSUPPORTED_PROTOCOL: return "Unsupported protocol";
    case CURLE_FAILED_INIT: return "Initialization failed";
    case CURLE_URL_MALFORMAT: return "Malformed URL";
    case CURLE_NOT_BUILT_IN: return "Feature not provided by browser Fetch";
    case CURLE_COULDNT_CONNECT: return "Browser HTTP broker could not connect";
    case CURLE_HTTP_RETURNED_ERROR: return "HTTP response was an error";
    case CURLE_WRITE_ERROR: return "Response callback rejected data";
    case CURLE_READ_ERROR: return "Request callback failed";
    case CURLE_OUT_OF_MEMORY: return "Out of memory";
    case CURLE_ABORTED_BY_CALLBACK: return "Aborted by callback";
    case CURLE_BAD_FUNCTION_ARGUMENT: return "Bad function argument";
    case CURLE_UNKNOWN_OPTION: return "Unsupported libcurl option";
    default: return "libcurl Fetch compatibility error";
  }
}

const char *curl_multi_strerror(CURLMcode error) {
  switch (error) {
    case CURLM_OK: return "No error";
    case CURLM_BAD_HANDLE: return "Invalid multi handle";
    case CURLM_BAD_EASY_HANDLE: return "Invalid easy handle";
    case CURLM_OUT_OF_MEMORY: return "Out of memory";
    case CURLM_ADDED_ALREADY: return "Easy handle already added";
    case CURLM_BAD_FUNCTION_ARGUMENT: return "Bad function argument";
    default: return "libcurl Fetch multi error";
  }
}

curl_version_info_data *curl_version_info(CURLversion age) {
  static const char *protocols[] = {"http", "https", NULL};
  static const char *features[] = {"SSL", NULL};
  static curl_version_info_data info = {
      .age = CURLVERSION_NOW,
      .version = LIBCURL_VERSION " (Dolly Fetch)",
      .version_num = LIBCURL_VERSION_NUM,
      .host = "wasm64-unknown-dolly",
      .features = CURL_VERSION_SSL,
      .ssl_version = "browser Fetch",
      .protocols = protocols,
      .feature_names = features,
  };
  (void)age;
  return &info;
}
