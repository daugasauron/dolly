#include <errno.h>
#include <stdio.h>
#include <string.h>

#define CURL_DISABLE_TYPECHECK
#include <curl/curl.h>

static void usage(FILE *stream) {
  fputs("usage: curl [-fsSL] [-o FILE] URL\n", stream);
}

int main(int argc, char **argv) {
  int fail_status = 0;
  int silent = 0;
  int show_error = 0;
  int follow = 0;
  const char *output_path = NULL;
  const char *url = NULL;

  for (int index = 1; index < argc; index++) {
    const char *argument = argv[index];
    if (strcmp(argument, "--version") == 0) {
      printf("curl %s (Dolly browser broker)\n", LIBCURL_VERSION);
      return 0;
    }
    if (strcmp(argument, "--help") == 0) {
      usage(stdout);
      return 0;
    }
    if (strcmp(argument, "--") == 0) {
      if (++index < argc && url == NULL) url = argv[index++];
      if (index != argc) {
        usage(stderr);
        return 2;
      }
      break;
    }
    if (strcmp(argument, "-o") == 0 || strcmp(argument, "--output") == 0) {
      if (++index == argc) {
        fprintf(stderr, "curl: %s requires a file\n", argument);
        return 2;
      }
      output_path = argv[index];
      continue;
    }
    if (strcmp(argument, "--fail") == 0) {
      fail_status = 1;
      continue;
    }
    if (strcmp(argument, "--silent") == 0) {
      silent = 1;
      continue;
    }
    if (strcmp(argument, "--show-error") == 0) {
      show_error = 1;
      continue;
    }
    if (strcmp(argument, "--location") == 0) {
      follow = 1;
      continue;
    }
    if (argument[0] == '-' && argument[1] != '\0') {
      for (const char *flag = argument + 1; *flag != '\0'; flag++) {
        if (*flag == 'f') fail_status = 1;
        else if (*flag == 's') silent = 1;
        else if (*flag == 'S') show_error = 1;
        else if (*flag == 'L') follow = 1;
        else {
          fprintf(stderr, "curl: unsupported option: -%c\n", *flag);
          return 2;
        }
      }
      continue;
    }
    if (url != NULL) {
      usage(stderr);
      return 2;
    }
    url = argument;
  }

  if (url == NULL) {
    usage(stderr);
    return 2;
  }

  FILE *output = stdout;
  if (output_path != NULL) {
    output = fopen(output_path, "wb");
    if (output == NULL) {
      if (!silent || show_error) fprintf(stderr, "curl: %s: %s\n", output_path, strerror(errno));
      return 1;
    }
  }

  CURL *curl = curl_easy_init();
  if (curl == NULL) {
    if (!silent || show_error) fputs("curl: could not create libcurl handle\n", stderr);
    if (output_path != NULL) fclose(output);
    return 1;
  }
  curl_easy_setopt(curl, CURLOPT_URL, url);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, output);
  curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, follow ? 1L : 0L);
  curl_easy_setopt(curl, CURLOPT_FAILONERROR, fail_status ? 1L : 0L);
  CURLcode result = curl_easy_perform(curl);
  curl_easy_cleanup(curl);
  if (output_path != NULL && fclose(output) != 0 && result == CURLE_OK)
    result = CURLE_WRITE_ERROR;

  if (result != CURLE_OK) {
    if (!silent || show_error) fprintf(stderr, "curl: %s\n", curl_easy_strerror(result));
    return result == CURLE_HTTP_RETURNED_ERROR ? 22 : 1;
  }
  return 0;
}
