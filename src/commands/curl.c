#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define CURL_DISABLE_TYPECHECK
#include <curl/curl.h>

static void usage(FILE *stream) {
  fputs(
      "usage: curl [options] URL\n"
      "  -f, --fail              fail without a body on HTTP errors\n"
      "      --fail-with-body    fail after writing an HTTP error body\n"
      "  -s, --silent            suppress errors\n"
      "  -S, --show-error        show errors with --silent\n"
      "  -L, --location          follow redirects\n"
      "  -I, --head              fetch headers only\n"
      "  -i, --include           include response headers in output\n"
      "  -X, --request METHOD    select HTTP method\n"
      "  -H, --header LINE       add a request header (repeatable)\n"
      "  -d, --data DATA         send request data (repeatable)\n"
      "      --json JSON         send JSON with conventional headers\n"
      "  -u, --user USER:PASS    use HTTP Basic authentication\n"
      "  -A, --user-agent TEXT   set User-Agent\n"
      "  -r, --range RANGE       request a byte range\n"
      "      --compressed        request compressed transfer encoding\n"
      "  -m, --max-time SECONDS  give up after SECONDS\n"
      "  -o, --output FILE       write body to FILE\n"
      "  -O, --remote-name       derive FILE from the URL\n"
      "  -D, --dump-header FILE  write response headers to FILE\n"
      "  -w, --write-out FORMAT  print response metadata\n"
      "  -v, --verbose           emit libcurl diagnostics\n"
      "Requests go through the browser: a URL needs CORS headers unless it is\n"
      "this page's origin, and /vVERSION/FILE is a file of this page's site,\n"
      "as recipes name them. The exit status is curl's: 7 the browser could not\n"
      "fetch, 9 refused by policy, 22 HTTP error with -f, 28 timed out.\n",
      stream);
}

static int append_data(char **buffer, size_t *length, const char *value) {
  size_t value_length = strlen(value);
  if (value_length > SIZE_MAX - *length - 2) return 0;
  size_t separator = *length == 0 ? 0 : 1;
  char *next = realloc(*buffer, *length + separator + value_length + 1);
  if (next == NULL) return 0;
  if (separator) next[(*length)++] = '&';
  memcpy(next + *length, value, value_length + 1);
  *length += value_length;
  *buffer = next;
  return 1;
}

static size_t write_file(char *bytes, size_t size, size_t count, void *data) {
  return size * fwrite(bytes, size, count, data == NULL ? stdout : (FILE *)data);
}

static char *remote_name(const char *url) {
  const char *end = url + strcspn(url, "?#");
  while (end > url && end[-1] == '/') --end;
  const char *start = end;
  while (start > url && start[-1] != '/') --start;
  if (start == end) {
    start = "index.html";
    end = start + sizeof("index.html") - 1;
  }
  size_t length = (size_t)(end - start);
  char *name = malloc(length + 1);
  if (name != NULL) {
    memcpy(name, start, length);
    name[length] = '\0';
  }
  return name;
}

static void write_out(const char *format, CURL *curl) {
  long code = 0;
  char *effective = NULL;
  char *content_type = NULL;
  curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &code);
  curl_easy_getinfo(curl, CURLINFO_EFFECTIVE_URL, &effective);
  curl_easy_getinfo(curl, CURLINFO_CONTENT_TYPE, &content_type);
  for (size_t index = 0; format[index] != '\0'; ++index) {
    if (format[index] == '\\' && format[index + 1] != '\0') {
      char escaped = format[++index];
      fputc(escaped == 'n' ? '\n' : escaped == 'r' ? '\r' :
            escaped == 't' ? '\t' : escaped, stdout);
    } else if (format[index] == '%' && format[index + 1] == '%') {
      fputc('%', stdout);
      ++index;
    } else if (format[index] == '%' && format[index + 1] == '{') {
      const char *name = format + index + 2;
      const char *close = strchr(name, '}');
      if (close == NULL) {
        fputc(format[index], stdout);
        continue;
      }
      size_t length = (size_t)(close - name);
      if (length == 9 && memcmp(name, "http_code", 9) == 0)
        printf("%03ld", code);
      else if (length == 13 && memcmp(name, "url_effective", 13) == 0)
        fputs(effective == NULL ? "" : effective, stdout);
      else if (length == 12 && memcmp(name, "content_type", 12) == 0)
        fputs(content_type == NULL ? "" : content_type, stdout);
      index = (size_t)(close - format);
    } else {
      fputc(format[index], stdout);
    }
  }
}

static const char *long_value(const char *argument, const char *name) {
  size_t length = strlen(name);
  return strncmp(argument, name, length) == 0 && argument[length] == '='
             ? argument + length + 1 : NULL;
}

int main(int argc, char **argv) {
  int fail_status = 0, fail_with_body = 0, silent = 0, show_error = 0;
  int follow = 0, nobody = 0, include_headers = 0, verbose = 0;
  int use_remote_name = 0, compressed = 0;
  const char *output_path = NULL, *header_path = NULL, *url = NULL;
  const char *method = NULL, *user_agent = NULL, *user = NULL, *range = NULL;
  const char *write_format = NULL, *max_time = NULL;
  char *body = NULL, *owned_output_path = NULL;
  size_t body_length = 0;
  struct curl_slist *headers = NULL;

  for (int index = 1; index < argc; ++index) {
    const char *argument = argv[index];
    const char *inline_value = NULL;
    if (strcmp(argument, "--version") == 0) {
      printf("curl %s (Dolly browser HTTP broker)\n", LIBCURL_VERSION);
      return 0;
    }
    if (strcmp(argument, "--help") == 0) { usage(stdout); return 0; }
    if (strcmp(argument, "--") == 0) {
      if (++index < argc && url == NULL) url = argv[index++];
      if (index != argc) { usage(stderr); return 2; }
      break;
    }

#define VALUE_OPTION(short_name, long_name, destination, label)                 \
    if (strcmp(argument, short_name) == 0 || strcmp(argument, long_name) == 0) { \
      if (++index == argc) { fprintf(stderr, "curl: %s requires %s\n", argument, label); goto usage_error; } \
      destination = argv[index]; continue;                                      \
    }                                                                            \
    if ((inline_value = long_value(argument, long_name)) != NULL) { destination = inline_value; continue; }

    VALUE_OPTION("-o", "--output", output_path, "a file")
    VALUE_OPTION("-D", "--dump-header", header_path, "a file")
    VALUE_OPTION("-X", "--request", method, "a method")
    VALUE_OPTION("-A", "--user-agent", user_agent, "text")
    VALUE_OPTION("-u", "--user", user, "credentials")
    VALUE_OPTION("-r", "--range", range, "a range")
    VALUE_OPTION("-w", "--write-out", write_format, "a format")
    VALUE_OPTION("-m", "--max-time", max_time, "seconds")
    VALUE_OPTION("", "--url", url, "a URL")
#undef VALUE_OPTION

    if (strcmp(argument, "-H") == 0 || strcmp(argument, "--header") == 0 ||
        (inline_value = long_value(argument, "--header")) != NULL) {
      const char *value = inline_value;
      if (value == NULL && ++index < argc) value = argv[index];
      if (value == NULL) { fputs("curl: --header requires a line\n", stderr); goto usage_error; }
      struct curl_slist *next = curl_slist_append(headers, value);
      if (next == NULL) goto memory_error;
      headers = next;
      continue;
    }
    if (strcmp(argument, "-d") == 0 || strcmp(argument, "--data") == 0 ||
        strcmp(argument, "--data-raw") == 0 ||
        (inline_value = long_value(argument, "--data")) != NULL ||
        (inline_value = long_value(argument, "--data-raw")) != NULL) {
      const char *value = inline_value;
      if (value == NULL && ++index < argc) value = argv[index];
      if (value == NULL) { fputs("curl: --data requires data\n", stderr); goto usage_error; }
      if (!append_data(&body, &body_length, value)) goto memory_error;
      continue;
    }
    if (strcmp(argument, "--json") == 0 ||
        (inline_value = long_value(argument, "--json")) != NULL) {
      const char *value = inline_value;
      if (value == NULL && ++index < argc) value = argv[index];
      if (value == NULL) { fputs("curl: --json requires data\n", stderr); goto usage_error; }
      if (!append_data(&body, &body_length, value)) goto memory_error;
      struct curl_slist *next = curl_slist_append(headers, "Content-Type: application/json");
      if (next == NULL) goto memory_error;
      headers = next;
      next = curl_slist_append(headers, "Accept: application/json");
      if (next == NULL) goto memory_error;
      headers = next;
      continue;
    }

    if (strcmp(argument, "--fail") == 0) fail_status = 1;
    else if (strcmp(argument, "--fail-with-body") == 0) fail_with_body = 1;
    else if (strcmp(argument, "--silent") == 0) silent = 1;
    else if (strcmp(argument, "--show-error") == 0) show_error = 1;
    else if (strcmp(argument, "--location") == 0) follow = 1;
    else if (strcmp(argument, "--head") == 0) nobody = 1;
    else if (strcmp(argument, "--include") == 0) include_headers = 1;
    else if (strcmp(argument, "--remote-name") == 0) use_remote_name = 1;
    else if (strcmp(argument, "--compressed") == 0) compressed = 1;
    else if (strcmp(argument, "--verbose") == 0) verbose = 1;
    else if (argument[0] == '-' && argument[1] == '-') {
      fprintf(stderr, "curl: unsupported option: %s\n", argument);
      goto usage_error;
    } else if (argument[0] == '-' && argument[1] != '\0') {
      for (const char *flag = argument + 1; *flag != '\0'; ++flag) {
        if (*flag == 'f') fail_status = 1;
        else if (*flag == 's') silent = 1;
        else if (*flag == 'S') show_error = 1;
        else if (*flag == 'L') follow = 1;
        else if (*flag == 'I') nobody = 1;
        else if (*flag == 'i') include_headers = 1;
        else if (*flag == 'O') use_remote_name = 1;
        else if (*flag == 'v') verbose = 1;
        else { fprintf(stderr, "curl: unsupported option: -%c\n", *flag); goto usage_error; }
      }
    } else if (url == NULL) url = argument;
    else { fputs("curl: only one URL is supported per invocation\n", stderr); goto usage_error; }
  }

  if (url == NULL) { usage(stderr); goto usage_error; }
  long timeout_milliseconds = 0;
  if (max_time != NULL) {
    char *end = NULL;
    const double seconds = strtod(max_time, &end);
    if (end == max_time || *end != '\0' || !(seconds >= 0) || seconds > 86400) {
      fprintf(stderr, "curl: --max-time: %s: expected seconds\n", max_time);
      goto usage_error;
    }
    timeout_milliseconds = (long)(seconds * 1000);
  }
  if (output_path != NULL && use_remote_name) {
    fputs("curl: --output and --remote-name are mutually exclusive\n", stderr);
    goto usage_error;
  }
  if (use_remote_name) {
    owned_output_path = remote_name(url);
    if (owned_output_path == NULL) goto memory_error;
    output_path = owned_output_path;
  }

  FILE *output = stdout;
  FILE *header_output = NULL;
  const char *failed_path = NULL;
  if (output_path != NULL && (output = fopen(output_path, "wb")) == NULL) {
    failed_path = output_path;
    goto file_error;
  }
  if (header_path != NULL && (header_output = fopen(header_path, "wb")) == NULL) {
    failed_path = header_path;
    goto file_error;
  }

  CURL *curl = curl_easy_init();
  if (curl == NULL) goto memory_error_open;
  // Fail explicitly when libcurl rejects an option.
  CURLcode result = CURLE_OK;
#define SET(option, value) \
  if (result == CURLE_OK) result = curl_easy_setopt(curl, option, value)
  SET(CURLOPT_URL, url);
  SET(CURLOPT_WRITEDATA, output);
  SET(CURLOPT_FOLLOWLOCATION, follow ? 1L : 0L);
  SET(CURLOPT_FAILONERROR, fail_status ? 1L : 0L);
  SET(CURLOPT_NOBODY, nobody ? 1L : 0L);
  SET(CURLOPT_VERBOSE, verbose ? 1L : 0L);
  if (method != NULL) SET(CURLOPT_CUSTOMREQUEST, method);
  if (user_agent != NULL) SET(CURLOPT_USERAGENT, user_agent);
  if (user != NULL) SET(CURLOPT_USERPWD, user);
  if (range != NULL) SET(CURLOPT_RANGE, range);
  if (timeout_milliseconds != 0) SET(CURLOPT_TIMEOUT_MS, timeout_milliseconds);
  if (compressed) SET(CURLOPT_ACCEPT_ENCODING, "");
  if (headers != NULL) SET(CURLOPT_HTTPHEADER, headers);
  if (body != NULL) {
    SET(CURLOPT_POSTFIELDS, body);
    SET(CURLOPT_POSTFIELDSIZE_LARGE, (curl_off_t)body_length);
  }
  if (header_output != NULL || include_headers || nobody) {
    SET(CURLOPT_HEADERFUNCTION, write_file);
    SET(CURLOPT_HEADERDATA, header_output != NULL ? header_output : output);
  }
#undef SET
  if (result == CURLE_OK) result = curl_easy_perform(curl);
  long response_code = 0;
  curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &response_code);
  if (write_format != NULL) write_out(write_format, curl);
  curl_easy_cleanup(curl);
  curl_slist_free_all(headers);
  free(body);
  free(owned_output_path);
  if (header_output != NULL && fclose(header_output) != 0 && result == CURLE_OK)
    result = CURLE_WRITE_ERROR;
  if (output_path != NULL && output != NULL && fclose(output) != 0 && result == CURLE_OK)
    result = CURLE_WRITE_ERROR;
  if (result != CURLE_OK) {
    if (!silent || show_error) fprintf(stderr, "curl: (%d) %s\n", result, curl_easy_strerror(result));
    return result;
  }
  if (fail_with_body && response_code >= 400) return 22;
  return 0;

file_error:
  if (!silent || show_error)
    fprintf(stderr, "curl: %s: %s\n", failed_path, strerror(errno));
  if (output_path != NULL && output != NULL && output != stdout) fclose(output);
  curl_slist_free_all(headers); free(body); free(owned_output_path);
  return 1;
memory_error_open:
  if (header_output != NULL) fclose(header_output);
  if (output_path != NULL && output != NULL && output != stdout) fclose(output);
memory_error:
  fputs("curl: out of memory\n", stderr);
  curl_slist_free_all(headers); free(body); free(owned_output_path);
  return 1;
usage_error:
  curl_slist_free_all(headers); free(body); free(owned_output_path);
  return 2;
}
